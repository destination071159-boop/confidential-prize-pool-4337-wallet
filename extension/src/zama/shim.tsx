/**
 * Extension-only drop-in for `@zama-fhe/react-sdk`.
 *
 * The upstream React SDK cannot run in an MV3 extension (its worker `importScripts` from
 * cdn.zama.org, blocked by CSP), so the shared apps/web pages import their FHE hooks from
 * `@zama-fhe/react-sdk` and — in the EXTENSION build only — this module is aliased in its place
 * (see vite.config.ts). It exposes the same `useEncrypt` / `useUserDecrypt` / `usePublicDecrypt`
 * / `ZamaProvider` surface, backed by the local UMD SDK in ./fhevm.
 */

import React, { createContext, useContext, useMemo } from "react";
import {
  useQuery,
  useMutation,
  type UseQueryOptions,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useAccount } from "wagmi";
import {
  encrypt as fhevmEncrypt,
  userDecrypt as fhevmUserDecrypt,
  delegatedUserDecrypt as fhevmDelegatedUserDecrypt,
  publicDecrypt as fhevmPublicDecrypt,
  type EncryptValue,
  type EncryptResult,
  type HandlePair,
  type PublicDecryptResult,
  type EIP712TypedData,
} from "./fhevm";

// The subset of a signer the decrypt flow needs (WagmiSigner satisfies this).
interface ZamaSigner {
  getAddress: () => Promise<string>;
  signTypedData: (eip712: EIP712TypedData) => Promise<string>;
}

interface ZamaContextValue {
  signer: ZamaSigner | null;
}
const ZamaContext = createContext<ZamaContextValue>({ signer: null });

/** Mirrors the upstream provider props; only `signer` is used by this shim. */
export function ZamaProvider({
  signer,
  children,
}: {
  relayer?: unknown;
  signer?: ZamaSigner;
  storage?: unknown;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ signer: signer ?? null }), [signer]);
  return <ZamaContext.Provider value={value}>{children}</ZamaContext.Provider>;
}

// ── Hooks (same signatures the apps/web pages consume) ──────────────────────────

export interface UserDecryptQueryConfig {
  handles: HandlePair[];
}
export type DecryptResult = Record<string, bigint>;

export function useUserDecrypt(
  config: UserDecryptQueryConfig,
  options?: Omit<UseQueryOptions<DecryptResult>, "queryKey" | "queryFn">
): UseQueryResult<DecryptResult, Error> {
  const { signer } = useContext(ZamaContext);
  const { address } = useAccount();
  const handleKey = config.handles.map((h) => `${h.handle}:${h.contractAddress}`).join(",");

  return useQuery<DecryptResult, Error>({
    queryKey: ["zama-user-decrypt", address, handleKey],
    queryFn: async () => {
      try {
        if (!signer) throw new Error("No signer available for decryption.");
        if (!address) throw new Error("Wallet not connected.");
        return await fhevmUserDecrypt(config.handles, address, (eip712) =>
          signer.signTypedData(eip712)
        );
      } catch (e) {
        console.error("[ZhieldWrap] userDecrypt failed:", e);
        throw e;
      }
    },
    ...options,
    enabled: (options?.enabled ?? true) && config.handles.length > 0 && !!signer && !!address,
  });
}

export interface EncryptParams {
  values: EncryptValue[];
  contractAddress: `0x${string}`;
  userAddress: `0x${string}`;
}

// Imperative regular user-decrypt (click-triggered). Decrypts handles allowed to the connected EOA.
export function useUserDecryptNow(): UseMutationResult<DecryptResult, Error, { handles: HandlePair[] }> {
  const { signer } = useContext(ZamaContext);
  const { address } = useAccount();
  return useMutation<DecryptResult, Error, { handles: HandlePair[] }>({
    mutationFn: async ({ handles }) => {
      if (!signer) throw new Error("No signer available for decryption.");
      if (!address) throw new Error("Wallet not connected.");
      return await fhevmUserDecrypt(handles, address, (eip712) => signer.signTypedData(eip712));
    },
  });
}

export function useEncrypt(): UseMutationResult<EncryptResult, Error, EncryptParams> {
  return useMutation<EncryptResult, Error, EncryptParams>({
    mutationFn: (params) => fhevmEncrypt(params),
  });
}

export function usePublicDecrypt(): UseMutationResult<PublicDecryptResult, Error, `0x${string}`[]> {
  return useMutation<PublicDecryptResult, Error, `0x${string}`[]>({
    mutationFn: (handles) => fhevmPublicDecrypt(handles),
  });
}

// Decrypt a DELEGATOR's (e.g. the smart account's) confidential balance as the connected delegate.
// Mirrors the real SDK's useDecryptBalanceAs, but takes explicit handle/contract pairs.
export interface DelegatedDecryptParams {
  handles: HandlePair[];
  delegatorAddress: `0x${string}`;
}
export function useDecryptBalanceAs(): UseMutationResult<DecryptResult, Error, DelegatedDecryptParams> {
  const { signer } = useContext(ZamaContext);
  const { address } = useAccount();
  return useMutation<DecryptResult, Error, DelegatedDecryptParams>({
    mutationFn: async ({ handles, delegatorAddress }) => {
      if (!signer) throw new Error("No signer available for decryption.");
      if (!address) throw new Error("Wallet not connected.");
      return fhevmDelegatedUserDecrypt(handles, delegatorAddress, address, (eip712) =>
        signer.signTypedData(eip712)
      );
    },
  });
}

// ── Misc symbols imported by providers.tsx (kept minimal / inert in this build) ──
export class RelayerWeb {
  config: unknown;
  constructor(config: unknown) {
    this.config = config;
  }
}
export const indexedDBStorage = {};
export const SepoliaConfig = {};
