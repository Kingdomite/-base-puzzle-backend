require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Contract source code
const ACHIEVEMENT_BADGES_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AchievementBadges {
    address public owner;
    address public authorizedSigner;
    
    mapping(address => mapping(uint256 => bool)) public hasBadge;
    mapping(bytes32 => bool) public usedSignatures;
    
    event BadgeMinted(address indexed player, uint256 indexed achievementId);
    event SignerUpdated(address indexed newSigner);
    
    constructor() {
        owner = msg.sender;
        authorizedSigner = msg.sender;
    }
    
    function updateSigner(address newSigner) external {
        require(msg.sender == owner, "Not owner");
        authorizedSigner = newSigner;
        emit SignerUpdated(newSigner);
    }
    
    function mintAchievement(uint256 achievementId, bytes memory signature) external {
        require(!hasBadge[msg.sender][achievementId], "Already minted");
        
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, achievementId));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\\x19Ethereum Signed Message:\\n32", messageHash));
        
        require(!usedSignatures[ethSignedMessageHash], "Signature already used");
        require(recoverSigner(ethSignedMessageHash, signature) == authorizedSigner, "Invalid signature");
        
        hasBadge[msg.sender][achievementId] = true;
        usedSignatures[ethSignedMessageHash] = true;
        
        emit BadgeMinted(msg.sender, achievementId);
    }
    
    function recoverSigner(bytes32 ethSignedMessageHash, bytes memory signature) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
        return ecrecover(ethSignedMessageHash, v, r, s);
    }
    
    function splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "Invalid signature length");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}
`;

const TOURNAMENT_MANAGER_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TournamentManager {
    address public owner;
    uint256 public currentTournamentId;
    uint256 public entryFee = 0.001 ether;
    
    struct Tournament {
        uint256 startTime;
        uint256 endTime;
        uint256 totalPrizePool;
        uint256 participantCount;
        bool finalized;
    }
    
    mapping(uint256 => Tournament) public tournaments;
    mapping(uint256 => mapping(address => bool)) public hasEntered;
    
    event TournamentEntered(uint256 indexed tournamentId, address indexed player);
    event TournamentFinalized(uint256 indexed tournamentId, uint256 prizePool);
    
    constructor() {
        owner = msg.sender;
        currentTournamentId = 1;
        tournaments[1] = Tournament({
            startTime: block.timestamp,
            endTime: block.timestamp + 1 days,
            totalPrizePool: 0,
            participantCount: 0,
            finalized: false
        });
    }
    
    function enterTournament() external payable {
        require(msg.value >= entryFee, "Insufficient entry fee");
        require(!hasEntered[currentTournamentId][msg.sender], "Already entered");
        
        hasEntered[currentTournamentId][msg.sender] = true;
        tournaments[currentTournamentId].participantCount++;
        tournaments[currentTournamentId].totalPrizePool += msg.value;
        
        emit TournamentEntered(currentTournamentId, msg.sender);
    }
    
    function getCurrentTournament() external view returns (Tournament memory) {
        return tournaments[currentTournamentId];
    }
}
`;

async function compileAndDeploy() {
    try {
        console.log('🚀 Deploying contracts with NEW secure wallet...\n');
        
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        
        console.log('Deployer address:', wallet.address);
        
        const balance = await provider.getBalance(wallet.address);
        console.log('Balance:', ethers.formatEther(balance), 'ETH\n');
        
        if (balance === 0n) {
            console.log('❌ No ETH in wallet! Get testnet ETH from:');
            console.log('https://www.alchemy.com/faucets/base-sepolia\n');
            return;
        }
        
        // Deploy AchievementBadges
        console.log('📝 Deploying AchievementBadges...');
        const AchievementBadges = new ethers.ContractFactory(
            [
                "constructor()",
                "function updateSigner(address newSigner) external",
                "function mintAchievement(uint256 achievementId, bytes memory signature) external",
                "function hasBadge(address, uint256) view returns (bool)",
                "function owner() view returns (address)",
                "function authorizedSigner() view returns (address)"
            ],
            "0x608060405234801561000f575f80fd5b50335f806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555033600160006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555061090b8061009d5f395ff3fe608060405234801561000f575f80fd5b506004361061006c575f3560e01c806329ee7e9b1461007057806344a0b2ad146100a05780637f345e1c146100be5780638da5cb5b146100da578063bb88fd2d146100f8578063e36f337114610128575b5f80fd5b61008a60048036038101906100859190610522565b610146565b60405161009791906105a7565b60405180910390f35b6100a8610173565b6040516100b591906105cf565b60405180910390f35b6100d860048036038101906100d39190610612565b610198565b005b6100e2610295565b6040516100ef91906105cf565b60405180910390f35b610112600480360381019061010d919061063d565b6102b8565b60405161011f91906105a7565b60405180910390f35b6101306102da565b60405161013d91906105cf565b60405180910390f35b5f60025f8473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f83815260200190815260200015f205f9054906101000a900460ff16905092915050565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f8054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614610226576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161021d906106b5565b60405180910390fd5b80600160006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055507f906a1c6bd8035469df70e9c1207c4aea633e94a61c84329110c9fcda8ac8f2c81604051610296919061070d565b60405180910390a150565b5f8054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b6003602052805f5260405f205f915054906101000a900460ff1681565b5f8054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f80fd5b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f61032a82610301565b9050919050565b61033a81610320565b8114610344575f80fd5b50565b5f8135905061035581610331565b92915050565b5f819050919050565b61036d8161035b565b8114610377575f80fd5b50565b5f8135905061038881610364565b92915050565b5f80604083850312156103a4576103a36102fd565b5b5f6103b185828601610347565b92505060206103c28582860161037a565b9150509250929050565b5f8115159050919050565b6103e0816103cc565b82525050565b5f6020820190506103f95f8301846103d7565b92915050565b61040881610320565b82525050565b5f6020820190506104215f8301846103ff565b92915050565b5f60208284031215610447576104466102fd565b5b5f61045484828501610347565b91505092915050565b610466816103cc565b82525050565b5f81519050919050565b5f82825260208201905092915050565b5f5b838110156104a3578082015181840152602081019050610488565b5f8484015250505050565b5f601f19601f8301169050919050565b5f6104c88261046c565b6104d28185610476565b93506104e2818560208601610486565b6104eb816104ae565b840191505092915050565b5f60208201905081810360008301526105108184906104be565b905092915050565b5f819050919050565b61052a81610518565b8114610534575f80fd5b50565b5f8135905061054581610521565b92915050565b5f80604083850312156105615761056061037a565b5b5f61056e85828601610347565b925050602061057f8582860161037a565b9150509250929050565b61059281610518565b82525050565b5f6020820190506105ab5f830184610589565b92915050565b5f604051905081810181811067ffffffffffffffff821117156105d757600080fd5b8060405250919050565b5f67ffffffffffffffff8211156105fb576105fa6105b7565b5b610604826104ae565b9050602081019050919050565b5f610623610621846105e1565b6105b7565b90508281526020810184848401111561063f5761063e6106f9565b5b61064a848285610486565b509392505050565b5f82601f830112610666576106656106f4565b5b8135610676848260208601610611565b91505092915050565b5f60208284031215610694576106936102fd565b5b5f82013567ffffffffffffffff8111156106b1576106b0610301565b5b6106bd84828501610652565b91505092915050565b7f4e6f74206f776e657200000000000000000000000000000000000000000000005f82015250565b5f6106fa600983610476565b9150610705826106c6565b602082019050919050565b5f6020820190508181035f830152610727816106ee565b905091905056fea2646970667358221220",
            wallet
        );
        
        const achievementBadges = await AchievementBadges.deploy();
        await achievementBadges.waitForDeployment();
        const achievementAddress = await achievementBadges.getAddress();
        console.log('✅ AchievementBadges deployed:', achievementAddress);
        
        // Deploy TournamentManager
        console.log('\n📝 Deploying TournamentManager...');
        const TournamentManager = new ethers.ContractFactory(
            [
                "constructor()",
                "function enterTournament() payable external",
                "function getCurrentTournament() view returns (tuple(uint256,uint256,uint256,uint256,bool))",
                "function hasEntered(uint256, address) view returns (bool)",
                "function currentTournamentId() view returns (uint256)"
            ],
            "0x608060405234801561000f575f80fd5b50335f806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055506001600181905550604051806080016040528042815260200142620151800142610079919061017b565b8152602001600081526020015f815260200160011515815250600260015481526020019081526020015f205f820151815f01556020820151816001015560408201518160020155606082015181600301556080820151816004015f6101000a81548160ff0219169083151502179055509050506101ae565b5f819050919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5f610185826100df565b9150610190836100df565b92508282019050808211156101a8576101a76100e8565b5b92915050565b6109dd806101bb5f395ff3fe608060405260043610610070575f3560e01c80638da5cb5b1161004e5780638da5cb5b146100fd578063a9d7d52514610127578063c78e1e9814610151578063f97fb6041461017b57610070565b806347ccca021461007457806365f4f7e4146100b157806369b002a7146100db575b5f80fd5b34801561007f575f80fd5b5061009a60048036038101906100959190610522565b6101a5565b6040516100a8929190610582565b60405180910390f35b3480156100bc575f80fd5b506100c56101d1565b6040516100d291906105a9565b60405180910390f35b6100e36101d6565b6040516100f495949392919061062c565b60405180910390f35b348015610108575f80fd5b5061011161030c565b60405161011e919061068e565b60405180910390f35b348015610132575f80fd5b5061013b61032f565b60405161014891906105a9565b60405180910390f35b34801561015c575f80fd5b50610165610335565b60405161017291906105a9565b60405180910390f35b348015610186575f80fd5b5061018f61033b565b60405161019c91906105a9565b60405180910390f35b600360205280815f5260405f20602052805f5260405f205f91509150509054906101000a900460ff1681565b66038d7ea4c680000090565b60026001548152602001905f8082015f015490806001015490806002015490806003015490806004015f9054906101000a900460ff16905085565b5f8054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b60015481565b600154815f820190508060010190508060020190508060030190508060040190505090565b5f80fd5b5f819050919050565b61037b81610369565b8114610385575f80fd5b50565b5f8135905061039681610372565b92915050565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f6103c58261039c565b9050919050565b6103d5816103bb565b81146103df575f80fd5b50565b5f813590506103f0816103cc565b92915050565b5f806040838503121561040c5761040b610365565b5b5f61041985828601610388565b925050602061042a858286016103e2565b9150509250929050565b5f8115159050919050565b61044881610434565b82525050565b5f6040820190506104615f83018561043f565b61046e602083018461043f565b9392505050565b61047e81610369565b82525050565b5f6020820190506104975f830184610475565b92915050565b6104a681610434565b82525050565b5f60a0820190506104bf5f830188610475565b6104cc6020830187610475565b6104d96040830186610475565b6104e66060830185610475565b6104f3608083018461049d565b9695505050505050565b61050681610369565b82525050565b5f6020820190506105195f8301846104fd565b92915050565b61052881610369565b82525050565b5f6040820190506105415f83018561051f565b61054e602083018461051f565b9392505050565b6105678261039c565b82525050565b5f6020820190506105805f83018461055e565b92915050565b5f60a0820190506105995f8301886104fd565b6105a66020830187610475565b6105b360408301866104fd565b6105c060608301856104fd565b6105cd608083018461049d565b9695505050505050565b7f496e73756666696369656e7420656e747279206665650000000000000000000005f82015250565b5f61060b601683610630565b9150610616826105d7565b602082019050919050565b5f6020820190508181035f830152610638816105ff565b905091905056fea2646970667358221220",
            wallet
        );
        
        const tournamentManager = await TournamentManager.deploy();
        await tournamentManager.waitForDeployment();
        const tournamentAddress = await tournamentManager.getAddress();
        console.log('✅ TournamentManager deployed:', tournamentAddress);
        
        console.log('\n🎉 Deployment Complete!\n');
        console.log('='.repeat(60));
        console.log('ACHIEVEMENT_BADGES=' + achievementAddress);
        console.log('TOURNAMENT_MANAGER=' + tournamentAddress);
        console.log('='.repeat(60));
        
        console.log('\n📝 Update these addresses in your .env files!');
        
        // Update backend .env
        const envPath = path.join(__dirname, '.env');
        let envContent = fs.readFileSync(envPath, 'utf8');
        envContent = envContent.replace(/ACHIEVEMENT_BADGES=.*/,  `ACHIEVEMENT_BADGES=${achievementAddress}`);
        envContent = envContent.replace(/TOURNAMENT_MANAGER=.*/, `TOURNAMENT_MANAGER=${tournamentAddress}`);
        fs.writeFileSync(envPath, envContent);
        
        console.log('✅ Backend .env updated!');
        
    } catch (error) {
        console.error('❌ Deployment failed:', error.message);
    }
}

compileAndDeploy();
