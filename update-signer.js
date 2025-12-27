require('dotenv').config();
const { ethers } = require('ethers');

const ACHIEVEMENT_BADGES_ABI = [
  "function updateSigner(address newSigner) external",
  "function owner() view returns (address)"
];

async function updateSigner() {
  try {
    console.log('🔄 Updating authorized signer...');
    
    // Connect with your MAIN wallet (the one that deployed contracts)
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    
    // You need to use the OWNER wallet here, not the new one
    console.log('\n⚠️  IMPORTANT: You need to run this with your OWNER wallet private key');
    console.log('The owner wallet is the one that deployed the contracts\n');
    
    const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY || process.env.PRIVATE_KEY;
    const ownerWallet = new ethers.Wallet(ownerPrivateKey, provider);
    
    console.log('Owner address:', ownerWallet.address);
    
    // Get new signer address from the new private key
    const newSignerWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const newSignerAddress = newSignerWallet.address;
    
    console.log('New signer address:', newSignerAddress);
    
    // Connect to contract
    const contract = new ethers.Contract(
      process.env.ACHIEVEMENT_BADGES,
      ACHIEVEMENT_BADGES_ABI,
      ownerWallet
    );
    
    // Check current owner
    const currentOwner = await contract.owner();
    console.log('Contract owner:', currentOwner);
    
    if (currentOwner.toLowerCase() !== ownerWallet.address.toLowerCase()) {
      console.log('\n❌ ERROR: You are not the contract owner!');
      console.log('You need to use the wallet that deployed the contracts.');
      return;
    }
    
    // Update signer
    console.log('\n📝 Sending transaction to update signer...');
    const tx = await contract.updateSigner(newSignerAddress);
    console.log('Transaction hash:', tx.hash);
    
    console.log('⏳ Waiting for confirmation...');
    await tx.wait();
    
    console.log('✅ Signer updated successfully!');
    console.log('New authorized signer:', newSignerAddress);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

updateSigner();
