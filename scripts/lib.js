const fs = require('fs');
const hre = require("hardhat");
const web3 = require('web3')
const {ethers} = require("hardhat");
let addrList= {}
function createFile() {
    create("./out/address.json",'')
    create("./out/addressList.json",'')
    create("./log/deploy.log",'')
    create("./config/config.json", '{}')
}

function createParam(param,contractAlias, contractName) {
    let path = "./param/"+ contractAlias + '.js'
    //console.log(path)
    let data = 'module.exports = ' + JSON.stringify(param,"","\t")
    create(path,'')
    fs.writeFile(path, data, (err) => {
        if (err) {
            throw err;
        }
        console.log(`                      ${contractAlias}  initPrarm: ${contractAlias}.js`);
    });
    data = `                      ${contractAlias}  initPrarm: ${contractAlias}.js`
    fs.appendFile('./log/deploy.log',data, 'utf8',
        function(err) {
            if (err){
                throw err
                console.log(err)
            }
        });
}

function log(ethValue, contractAlias, contractName,signer,addr,txid,...param) {
    let list=[]
    for(let i=0;i< param.length;i++){
        list.push(JSON.stringify(param[i]))
    }
    let data = `\n${new Date().format("yyyy-MM-dd  hh:mm:ss")}  ${contractName}.sol  ${contractAlias} deploy success! 
                                 signer:${signer}
                                 addr: ${addr}  
                                 txid: ${txid} 
                                 param: ${list} 
                                 ethValue: ${ethValue}    \n`
    console.log(data)
    fs.appendFile('./log/deploy.log',data, 'utf8',
        function(err) {
            if (err){
                throw err
                console.log(err)
            }
        });
}
async function logTx(ethValue,contractAlias, signerIndex,funcName,addr,txid,...param) {
    const accounts = await hre.ethers.getSigners();
    const signer = accounts[signerIndex];
    let list=[]
    for(let i=0;i< param.length;i++){
        list.push(JSON.stringify(param[i]))
    }
    let data = `\n${new Date().format("yyyy-MM-dd  hh:mm:ss")}   调用 \< ${contractAlias} \> 方法：${funcName}
                                 signer:${signer.address}
                                 callContract: ${addr}  
                                 txid: ${txid} 
                                 param: ${list} 
                                 ethValue: ${ethValue}\n`
    console.log(data)
    fs.appendFile('./log/deploy.log',data, 'utf8',
        function(err) {
            if (err){
                throw err
                console.log(err)
            }
        });
}

function create(filePath,data) {
    if (!fs.existsSync(filePath)) {
        const dirCache={};
        const arr=filePath.split('/');
        let dir=arr[0];
        for(let i=1;i<arr.length;i++){
            if(!dirCache[dir]&&!fs.existsSync(dir)){
                dirCache[dir]=true;
                fs.mkdirSync(dir);
            }
            dir=dir+'/'+arr[i];
        }
        fs.writeFileSync(filePath, data)
    }
}

function sleep(s) {
    return new Promise(resolve => setTimeout(resolve, s *1000));
}

function encodeFunction(functionName,abiList,paramList) {
    let encodeData = web3.eth.abi.encodeFunctionSignature(functionName) +
        web3.eth.abi.encodeParameters(abiList, paramList).substring(2)
    return encodeData
}
//formatBytes32String, parseBytes32String
function strToBytes32(str){
    return web3.utils.stringToHex()
}
async function getStorageAt(contractAddr, solt,type){
    let result = await ethers.provider.getStorageAt(contractAddr, solt)
    if(type == 'uint'){
        result = web3.utils.hexToNumber(result)
    }else if(type == 'address'){
        result = ethers.utils.getAddress("0x" + result.substring(26))
    }else if(type == 'string'){
        result = web3.utils.hexToString(result)
    }
    return result
}
async function getProxyslot(contractAddr){
    let proxy={}
    let _IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
    let _ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"
    let _BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50"
    let impl = await ethers.provider.getStorageAt(contractAddr, _IMPLEMENTATION_SLOT)
    impl = ethers.utils.getAddress("0x" + impl.substring(26))
    let admin = await ethers.provider.getStorageAt(contractAddr, _ADMIN_SLOT)
    admin = ethers.utils.getAddress("0x" + admin.substring(26))
    let beacon = await ethers.provider.getStorageAt(contractAddr, _BEACON_SLOT)
    beacon = ethers.utils.getAddress("0x" + beacon.substring(26))
    if(admin != '0x0000000000000000000000000000000000000000'){
        proxy["admin"] = admin
    }
    if(impl != '0x0000000000000000000000000000000000000000'){
        proxy["impl"] = impl
    }
    if(beacon != '0x0000000000000000000000000000000000000000'){
        proxy["beacon"] = beacon
    }
    return proxy
}
function convertToObject(inputObject) {
    let outputObject={}
    for (const key in inputObject) {
        if (inputObject.hasOwnProperty(key)) {
            outputObject[key] = inputObject[key].address;
        }
    }
    return outputObject
}
async function sendTransaction(contractAlias,signerIndex,contractAddr,functionName,abiList,...params) {
    // let encode = web3.eth.abi.encodeFunctionCall({
    //   name: 'file',
    //   type: 'function',
    //   inputs: [{
    //     type: 'bytes32',
    //     name: 'what'
    //   },{
    //     type: 'uint256',
    //     name: 'data'
    //   }]
    // }, ["base".toByte32(), 444]);
    // console.log(encode)
    let ethValue;
    let options = params[params.length - 1];
    if (typeof options === 'object') {
        if (options.value !== undefined) {
            ethValue = options.value;
            params = params.slice(0, -1);
        }
    }
    params = params[0]
    //console.log("params",params)
    let amount = '0'
    if (ethValue) {
        amount = hre.ethers.utils.parseEther(ethValue).toString();
    }
    let str=""
    for(let i=0;i<abiList.length;i++){
        if(abiList[i]=='unit'){abiList[i]='unit256'}
        str =str+abiList[i]+','
    }
    str = str.slice(0,str.length-1)
    functionName =`${functionName}(${str})`
    let encodeData = web3.eth.abi.encodeFunctionSignature(functionName) +
        web3.eth.abi.encodeParameters(abiList, params).substring(2)
    //console.log(encodeData)
    const transaction = {to: contractAddr, data: encodeData, value: amount};
    const accounts = await hre.ethers.getSigners();
    const signer = accounts[signerIndex];
    const txResponse =await signer.sendTransaction(transaction);
    await txResponse.wait();
    await logTx(ethValue || "0",contractAlias, signerIndex,functionName,contractAddr,txResponse.hash,params)
    return txResponse
}
Date.prototype.format = function(fmt) {
    var o = {
        "M+" : this.getMonth()+1,                 //月份
        "d+" : this.getDate(),                    //日
        "h+" : this.getHours(),                   //小时
        "m+" : this.getMinutes(),                 //分
        "s+" : this.getSeconds(),                 //秒
        "q+" : Math.floor((this.getMonth()+3)/3), //季度
        "S" : this.getMilliseconds()             //毫秒
    };
    if(/(y+)/.test(fmt)) {
        fmt=fmt.replace(RegExp.$1, (this.getFullYear()+"").substr(4 - RegExp.$1.length));
    }
    for(var k in o) {
        if(new RegExp("("+ k +")").test(fmt)){
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length==1) ? (o[k]) : (("00"+ o[k]).substr((""+ o[k]).length)));
        }
    }
    return fmt;
}
function saveAddr(addr) {
    let addrata = JSON.stringify(addr,"","\t");
    fs.writeFile('./out/address.json', addrata, (err) => {
        if (err) {
            throw err;
        }
        console.log("Address data is stored in out/address.json");
    });
    addrata = JSON.stringify(convertToObject(addr),"","\t");
    fs.writeFile('./out/addressList.json', addrata, (err) => {
        if (err) {
            throw err;
        }
        console.log("AddressList data is stored in out/addressList.json");
    });
}

async function getABI(name) {
    const contract = await ethers.getContractFactory(name);
    const abi = contract.interface.format("json");
    return abi
}

async function getContract(contractName, address) {
    const signer = await hre.ethers.getSigner();
    const ABI = await getABI(contractName);
    return  await new hre.ethers.Contract(address, ABI, signer)
}

async function getContractByABI(address,ABI) {
    const signer = await hre.ethers.getSigner();
    return  await new hre.ethers.Contract(address, ABI, signer)
}
async function executeContract(contractAlias,signerIndex, contract, functionName, ...params) {
    let ethValue;
    let options = params[params.length - 1];

    if (typeof options === 'object') {
        if (options.value !== undefined) {
            ethValue = options.value;
            params = params.slice(0, -1);
        }
    }
    let deploymentOptions = {};
    if (ethValue) {
        const amount = hre.ethers.utils.parseEther(ethValue).toString();
        deploymentOptions.value = amount;
    }
    const accounts = await hre.ethers.getSigners();
    const signer = accounts[signerIndex];
    tx = await contract.connect(signer).functions[functionName](...params, deploymentOptions);
    await tx.wait();
    await logTx(ethValue || "0",contractAlias, signerIndex,functionName,contract.address,tx.hash,params)

}


// async function deploy(ethValue, contractAlias,signerIndex, contractName, ...params) {
//     const amount = hre.ethers.utils.parseEther(ethValue).toString();
//     const Contract = await hre.ethers.getContractFactory(contractName);
//     const accounts = await hre.ethers.getSigners();
//     const signer = accounts[signerIndex];
//     const contract = await Contract.connect(signer).deploy(...params, { value: amount });
//     await contract.deployed();
//     await createParam(params, contractAlias, contractName);
//     log(amount, contractAlias, contractName, signer.address,contract.address, contract.deployTransaction.hash, params);
//     addrList[contractAlias] = {contract: contractName, address:contract.address}
//     return contract;
// }
async function deploy(contractAlias, signerIndex, contractName, ...params) {
    let ethValue;
    let options = params[params.length - 1];
    if (typeof options === 'object') {
        if (options.value !== undefined) {
            ethValue = options.value;
            params = params.slice(0, -1);
        }
    }
    const Contract = await hre.ethers.getContractFactory(contractName);
    const accounts = await hre.ethers.getSigners();
    const signer = accounts[signerIndex];
    let deploymentOptions = {};
    if (ethValue) {
        const amount = hre.ethers.utils.parseEther(ethValue).toString();
        deploymentOptions.value = amount;
    }
    const contract = await Contract.connect(signer).deploy(...params, deploymentOptions);
    await contract.deployed();
    await createParam(params, contractAlias, contractName);
    log(ethValue || "0", contractAlias, contractName, signer.address, contract.address, contract.deployTransaction.hash, params);
    addrList[contractAlias] = { contract: contractName, address: contract.address };
    return contract;
}
function addrListAddObject(inputObject, nameList, addrList) {
    let outputObject={}
    for (const key in inputObject) {
        if (inputObject.hasOwnProperty(key)) {
            outputObject[key] = inputObject[key].address;
        }
    }
    for(let i=0;i<nameList.length;i++){
        outputObject[nameList[i]] = addrList[i]
    }
    // console.log(outputObject)
}
module.exports ={
    //将方法和该方法的参数进行编码 functionName：函数名,abiList：参数类型数组,paramList：参数数组
    /*
    let encodeData = await encodeFunction(
          "rely(address,address,address,address)",
          ['address','address','address','address'],
          [address1, address2, address3 ,address4]);

    * */
    encodeFunction,

    /*发送交易，有些方法无法直接发送，会报错：TypeError: ProxyDeployer.execute is not a function
      当一个合约中出现同名不同参数的方法，就会出现上面的错误，则只能通过这个方法来执行
      contractAlias,给部署的合约取个新名字
      signerIndex,  签名交易用第几个私钥，从0开始
      contractName, 合约源码名字
      contractAddr  合约地址,
      functionName： 函数名,
      abiList：      参数类型数组,
      paramList：    参数数组
      {value: ethValue}: 可选参数，要发送的eth

        await sendTransaction("0","ProxyDeployer",0,"DSProxy",ProxyDeployer,
      "execute(address,bytes memory)",['address', 'bytes'],[address,encodeData])

    * */
    sendTransaction,
    /*
        contractAlias,给部署的合约取个新名字
        signerIndex,  签名交易用第几个私钥，从0开始
        contractName, 合约对象
        functionName，函数名,
        ...params   合约需要几个参数就依次写入
        {value: ethValue}: 可选参数，要发送的eth
        * */
    executeContract,

    //记录一些日志
    log,
    /*
      ethValue,     要发送的eth
      contractAlias,给部署的合约取个新名字
      signerIndex,  签名交易用第几个私钥，从0开始
      contractName, 合约源码名字
      funcName,  调用的函数名
      addr,      合约地址
      txid,       交易id
      ...param    合约需要几个参数就依次写入
    * */
    logTx,
    /*
    contractAlias,给部署的合约取个新名字
    signerIndex,  签名交易用第几个私钥，从0开始
    contractName, 合约源码名字
    ...params   合约需要几个参数就依次写入
    {value: ethValue}: 可选参数，要发送的eth
    * */
    deploy,

    //通过合约地址，源码获取合约实例。contractName：合约源码名称, address：合约地址
    getContract,
    //通过合约地址，合约ABI获取合约实例。address：合约地址，ABI: 合约的abi
    getContractByABI,
    getStorageAt,
    getProxyslot,
    createFile,         //
    create,             //
    saveAddr,           //
    sleep,
    createParam,        //
    getABI,             //
    addrList,
    addrListAddObject

}







