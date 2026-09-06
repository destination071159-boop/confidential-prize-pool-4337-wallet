/**
 * errors.ts — Custom error classes for @zhieldwrap/core
 */

/** Thrown when a contract address is not a valid ERC-7984 token */
export class InvalidTokenError extends Error {
  constructor(address: string, reason?: string) {
    super(
      reason
        ? `${address}: ${reason}`
        : `${address} is not a valid ERC-7984 contract`
    );
    this.name = "InvalidTokenError";
  }
}

/** Thrown when the onchain registry cannot be reached */
export class RegistryFetchError extends Error {
  constructor(cause?: unknown) {
    super(
      `Failed to fetch from Zama Wrappers Registry${
        cause ? `: ${String(cause)}` : ""
      }`
    );
    this.name = "RegistryFetchError";
  }
}

/** Thrown when a wrap/unwrap transaction fails */
export class WrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WrapError";
  }
}

/** Thrown when a ZK proof is invalid or cannot be generated */
export class ZKProofError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZKProofError";
  }
}

/** Thrown when a ZK nullifier has already been spent (double-withdraw) */
export class NullifierSpentError extends Error {
  constructor(nullifier: string) {
    super(`Nullifier already spent: ${nullifier}`);
    this.name = "NullifierSpentError";
  }
}

/** Thrown when a privacy pool root is unknown (stale proof) */
export class StaleRootError extends Error {
  constructor(root: string) {
    super(`Merkle root not recognized by pool: ${root}`);
    this.name = "StaleRootError";
  }
}

/** Thrown when a cross-swap route is not registered */
export class RouteNotFoundError extends Error {
  constructor(inputToken: string, outputToken: string) {
    super(`No route registered between ${inputToken} and ${outputToken}`);
    this.name = "RouteNotFoundError";
  }
}

/** Thrown when the faucet cooldown has not expired */
export class FaucetCooldownError extends Error {
  constructor(remainingMs: number) {
    const hours = Math.ceil(remainingMs / 3_600_000);
    super(`Faucet cooldown active — try again in ${hours}h`);
    this.name = "FaucetCooldownError";
  }
}
