import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Escrow as Program<Escrow>;
  const connection = provider.connection;

  // Wallets
  const maker = Keypair.generate();
  const taker = Keypair.generate();

  // Mints
  let mintA: PublicKey; // token maker offers
  let mintB: PublicKey; // token maker wants

  // Token accounts
  let makerAtaA: PublicKey;
  let makerAtaB: PublicKey;
  let takerAtaA: PublicKey;
  let takerAtaB: PublicKey;

  // Escrow state
  const seed = new BN(42);
  const depositAmount = new BN(1_000_000);   // 1 token A (6 decimals)
  const receiveAmount = new BN(2_000_000);   // 2 token B (6 decimals)

  let escrowPda: PublicKey;
  let vaultAta: PublicKey;

  // ─── Setup ────────────────────────────────────────────────────────────────

  before(async () => {
    // Airdrop SOL to maker and taker so they can pay fees & rent
    await connection.confirmTransaction(
      await connection.requestAirdrop(maker.publicKey, 2 * LAMPORTS_PER_SOL)
    );
    await connection.confirmTransaction(
      await connection.requestAirdrop(taker.publicKey, 2 * LAMPORTS_PER_SOL)
    );

    // Create mint A (maker's token) — provider wallet is mint authority
    mintA = await createMint(
      connection,
      (provider.wallet as anchor.Wallet).payer,
      provider.wallet.publicKey,
      null,
      6
    );

    // Create mint B (taker's token)
    mintB = await createMint(
      connection,
      (provider.wallet as anchor.Wallet).payer,
      provider.wallet.publicKey,
      null,
      6
    );

    // Create ATAs
    makerAtaA = await createAssociatedTokenAccount(
      connection,
      (provider.wallet as anchor.Wallet).payer,
      mintA,
      maker.publicKey
    );
    makerAtaB = await createAssociatedTokenAccount(
      connection,
      (provider.wallet as anchor.Wallet).payer,
      mintB,
      maker.publicKey
    );
    takerAtaA = await createAssociatedTokenAccount(
      connection,
      (provider.wallet as anchor.Wallet).payer,
      mintA,
      taker.publicKey
    );
    takerAtaB = await createAssociatedTokenAccount(
      connection,
      (provider.wallet as anchor.Wallet).payer,
      mintB,
      taker.publicKey
    );

    // Fund wallets with tokens
    await mintTo(
      connection,
      (provider.wallet as anchor.Wallet).payer,
      mintA,
      makerAtaA,
      provider.wallet.publicKey,
      depositAmount.toNumber() * 2 // extra so maker can make multiple escrows in tests
    );
    await mintTo(
      connection,
      (provider.wallet as anchor.Wallet).payer,
      mintB,
      takerAtaB,
      provider.wallet.publicKey,
      receiveAmount.toNumber() * 2
    );

    // Derive escrow PDA address
    [escrowPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        maker.publicKey.toBuffer(),
        seed.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    // Derive vault ATA (owned by escrow PDA)
    vaultAta = getAssociatedTokenAddressSync(mintA, escrowPda, true);
  });

  // ─── Test: make ───────────────────────────────────────────────────────────

  it("make: creates escrow and deposits token A into vault", async () => {
    await program.methods
      .make(seed, receiveAmount, depositAmount)
      .accountsPartial({
        maker: maker.publicKey,
        mintA,
        mintB,
        makerAtaA,
        escrow: escrowPda,
        vault: vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([maker])
      .rpc();

    // Vault should now hold the deposited amount
    const vault = await getAccount(connection, vaultAta);
    assert.equal(
      vault.amount.toString(),
      depositAmount.toString(),
      "Vault should hold the deposited token A amount"
    );

    // Escrow account should store correct state
    const escrow = await program.account.escrow.fetch(escrowPda);
    assert.equal(escrow.maker.toBase58(), maker.publicKey.toBase58());
    assert.equal(escrow.mintA.toBase58(), mintA.toBase58());
    assert.equal(escrow.mintB.toBase58(), mintB.toBase58());
    assert.equal(escrow.receive.toString(), receiveAmount.toString());
    assert.equal(escrow.seed.toString(), seed.toString());
  });

  // ─── Test: take ───────────────────────────────────────────────────────────

  it("take: taker sends token B to maker, receives token A from vault", async () => {
    const makerAtaBBefore = await getAccount(connection, makerAtaB);
    const takerAtaABefore = await getAccount(connection, takerAtaA);

    await program.methods
      .take()
      .accountsPartial({
        taker: taker.publicKey,
        maker: maker.publicKey,
        mintA,
        mintB,
        takerAtaA,
        takerAtaB,
        makerAtaB,
        escrow: escrowPda,
        vault: vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([taker])
      .rpc();

    // Maker should have received token B
    const makerAtaBAfter = await getAccount(connection, makerAtaB);
    assert.equal(
      (makerAtaBAfter.amount - makerAtaBBefore.amount).toString(),
      receiveAmount.toString(),
      "Maker should receive the requested token B amount"
    );

    // Taker should have received token A from vault
    const takerAtaAAfter = await getAccount(connection, takerAtaA);
    assert.equal(
      (takerAtaAAfter.amount - takerAtaABefore.amount).toString(),
      depositAmount.toString(),
      "Taker should receive the deposited token A amount"
    );

    // Escrow account should be closed
    const escrowAccount = await connection.getAccountInfo(escrowPda);
    assert.isNull(escrowAccount, "Escrow account should be closed after take");
  });

  // ─── Test: refund ─────────────────────────────────────────────────────────

  it("refund: maker cancels and gets token A back", async () => {
    // Create a new escrow with a different seed so we have a fresh one to refund
    const refundSeed = new BN(99);
    const [refundEscrowPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        maker.publicKey.toBuffer(),
        refundSeed.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const refundVaultAta = getAssociatedTokenAddressSync(
      mintA,
      refundEscrowPda,
      true
    );

    // Make a new escrow
    await program.methods
      .make(refundSeed, receiveAmount, depositAmount)
      .accountsPartial({
        maker: maker.publicKey,
        mintA,
        mintB,
        makerAtaA,
        escrow: refundEscrowPda,
        vault: refundVaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([maker])
      .rpc();

    const makerAtaABefore = await getAccount(connection, makerAtaA);

    // Refund it
    await program.methods
      .refund()
      .accountsPartial({
        maker: maker.publicKey,
        mintA,
        makerAtaA,
        escrow: refundEscrowPda,
        vault: refundVaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([maker])
      .rpc();

    // Maker should have gotten token A back
    const makerAtaAAfter = await getAccount(connection, makerAtaA);
    assert.equal(
      (makerAtaAAfter.amount - makerAtaABefore.amount).toString(),
      depositAmount.toString(),
      "Maker should get the deposited token A back on refund"
    );

    // Escrow account should be closed
    const escrowAccount = await connection.getAccountInfo(refundEscrowPda);
    assert.isNull(
      escrowAccount,
      "Escrow account should be closed after refund"
    );
  });
});
