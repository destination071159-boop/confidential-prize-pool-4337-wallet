/* Reproduce the owner user-decrypt of the policy handles (backend/ACL test, no browser). */
const { createInstance, SepoliaConfig } = require('@zama-fhe/relayer-sdk/node');
const { Wallet } = require('ethers');

const MODULE = '0x020c4D65503C37d5BD0e30b1dE016508bD1C875B';
const ACC = '0x4B8192BB2600477e555320512986F4058B136c41';
const KEY = '0x874604c87A1FEF538Ce21192aac0Db131F5F24ae';

async function main() {
  const pk = process.env.PRIVATE_KEY;
  const wallet = new Wallet(pk);
  const userAddress = wallet.address; // owner EOA = registered policy viewer
  console.log('user (owner EOA / viewer):', userAddress);

  const instance = await createInstance({ ...SepoliaConfig, network: process.env.SEPOLIA_RPC_URL });

  // Fetch the two handles straight from the module.
  const { JsonRpcProvider, Contract } = require('ethers');
  const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const abi = [
    'function limitOf(address,address) view returns (bytes32)',
    'function spentOf(address,address) view returns (bytes32)',
  ];
  const mod = new Contract(MODULE, abi, provider);
  const limitHandle = await mod.limitOf(ACC, KEY);
  const spentHandle = await mod.spentOf(ACC, KEY);
  console.log('limit handle:', limitHandle, '\nspent handle:', spentHandle);

  const keypair = instance.generateKeypair();
  const handleContractPairs = [
    { handle: limitHandle, contractAddress: MODULE },
    { handle: spentHandle, contractAddress: MODULE },
  ];
  const startTimeStamp = Math.floor(Date.now() / 1000); // number
  const durationDays = 7; // number
  const contractAddresses = [MODULE];

  const eip712 = instance.createEIP712(
    keypair.publicKey,
    contractAddresses,
    startTimeStamp,
    durationDays,
  );
  const signature = await wallet.signTypedData(
    eip712.domain,
    { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
    eip712.message,
  );

  console.log('calling relayer userDecrypt…');
  const result = await instance.userDecrypt(
    handleContractPairs,
    keypair.privateKey,
    keypair.publicKey,
    signature.replace('0x', ''),
    contractAddresses,
    userAddress,
    startTimeStamp,
    durationDays,
  );
  console.log('\nDECRYPTED ✅');
  console.log('  limit =', result[limitHandle]?.toString(), '(micro) =', Number(result[limitHandle]) / 1e6, 'cUSD');
  console.log('  spent =', result[spentHandle]?.toString(), '(micro) =', Number(result[spentHandle]) / 1e6, 'cUSD');
}
main().catch((e) => {
  console.error('DECRYPT FAILED:', e.message);
  if (e.cause) console.error('cause:', e.cause);
});
