const ethers = require('ethers');

const FundETHJson = require("./ABI/FundETH_ABI.json")
const ERC20TokenABIJson = require("./ABI/ERC20TokenABI.json")

require('dotenv').config();
const env = process.env;
const L2_NODE_WEB3_URL = env.L2_NODE_WEB3_URL || "http://localhost:8545";
const PRIVATE_KEY = env.DEPLOYER_PRIVATE_KEY

const main = async() => {
    if(process.argv.length != 3){
        console.error("Error: Provide the number of operations to be performed: yarn benchmark <num_ops>")
        process.exit(1)
    }

    numOps = Number(process.argv[2])
    console.log("-> Performing operations:", numOps);

    const provider = new ethers.providers.JsonRpcProvider(L2_NODE_WEB3_URL);
    const L2Wallet = new ethers.Wallet(PRIVATE_KEY).connect(provider);

    // Check ETH balance
    const ethBalance = await L2Wallet.getBalance()
    const minEthBalance = ethers.utils.parseEther((numOps * 0.002 + 0.1).toString())
    if (ethBalance.lt(minEthBalance)) {
        console.error("Error: Insufficient ETH balance. Required:", minEthBalance.toString(), "Available:", ethBalance.toString())
        process.exit(1)
    }

    // Alert
    if (numOps > 80) {
        console.log("-> WARNING: This benchmark might be fail due to the number of operations")
    }

    // deploy contract
    const Factory__FundETHContract = new ethers.ContractFactory(
        FundETHJson.abi,
        FundETHJson.bytecode,
        L2Wallet
    )
    FundETHContract = await Factory__FundETHContract.deploy()
    await FundETHContract.deployTransaction.wait()

    const Factory__ERC20 = new ethers.ContractFactory(
      ERC20TokenABIJson.abi,
      ERC20TokenABIJson.bytecode,
      L2Wallet
    )
    ERC20 = await Factory__ERC20.deploy()
    await ERC20.deployTransaction.wait()

    console.log(`-> Deployed FundETH Contract: ${FundETHContract.address} and ERC20 Contract: ${ERC20.address}`)

    // Create wallets
    const wallets = []
    for (let i = 0; i < numOps; i++) {
      wallets.push(ethers.Wallet.createRandom().connect(provider))
    }

    // Send funds
    const addETHTx = await L2Wallet.sendTransaction({
        to: FundETHContract.address,
        value: ethers.utils.parseEther((numOps * 0.002).toString())
    })
    await addETHTx.wait()

    // Add funds to the wallets
    const payload = []
    for (let i = 0; i < numOps; i++) {
        payload.push({testAccount: wallets[i].address})
    }
    const addETHWalletsTx = await FundETHContract.addETH(payload)
    await addETHWalletsTx.wait()

    // Event listener
    let eventcount = 0;
    // event listener
    ERC20.on("Transfer", ()=>{
        console.log(`Listener Event Count: ${++eventcount}`);
        if(eventcount == numOps){
            ERC20.removeAllListeners();
        }
    })

    // Check token supply
    const supplyBefore = await ERC20.totalSupply();
    console.log("-> Initial supply is: ", supplyBefore.toNumber());

    // Call mint function
    var start = process.hrtime()

    const promiseArray = []
    for (let i = 0; i < numOps; i++) {
      promiseArray.push(ERC20.connect(wallets[i]).mint(L2Wallet.address, 1))
    }
    await Promise.all(promiseArray)

    var end = process.hrtime(start)
    console.info('-> Execution time (hr): %ds %dms', end[0], end[1] / 1000000)

    // Check token supply
    const supplyAfter = await ERC20.totalSupply();
    console.log("-> Current supply is: ", supplyAfter.toNumber());
}

main()