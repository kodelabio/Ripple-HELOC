// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const { network,har,ethers } = require("hardhat");
const { execSync } = require('child_process');
const web3 = require('web3')
const BigNumber = require('bignumber.js');
let { addrList,executeContract,encodeFunction,sendTransaction,deploy,saveAddr,createFile,logTx } = require('./lib')
const fs = require("fs");
let configjson
/*
  总gas：50250000
  部署到主网，要注意两个交易：
         放弃放弃合约控制权
      MCD_DAI,'deny',addrList["DEPLOYER"].address

      7. 部署治理代币鉴权器
        允许开发者铸造 (生产环境去除该设置)
      8. 启动治理
        放弃MCD_GOV 管理员权限 主网中

* */
async function main() {
  await createFile()
  var data=fs.readFileSync('./config/config.json','utf-8');
  configjson = JSON.parse(data.toString());
  await exec()
  convertToObject(addrList)
  saveAddr(addrList)


}
async function exec() {
  let signer = await ethers.getSigner()
  addrList["DEPLOYER"] = {contract: "DEPLOYER", address:signer.address}
  //1. 部署治理代币Token
  let MCD_GOV = await deploy("MCD_GOV", 0, "DSToken","Token");

  //2.部署HouseTokenWrapper相关合约
  let result = await deployHouseTokenWrapper(addrList)
  addrList = result.addrList
  let SpellRegistContract = result.SpellRegist

  //3. 部署MCD_IOU合约
  let MCD_IOU = await deploy("MCD_IOU", 0, "DSToken","IOU");

  //4. 部署MCD_ADM合约
  let MCD_ADM = await deploy("MCD_ADM", 0, "DSChief",MCD_GOV.address,MCD_IOU.address,5,SpellRegistContract.address);
  //配置IOU
  await executeContract('MCD_IOU',0,MCD_IOU,'setOwner',MCD_ADM.address)

  //5. 部署VOTE_PROXY_FACTORY合约 dapp create VoteProxyFactory "$MCD_ADM" --verify
  let VOTE_PROXY_FACTORY = await deploy("VOTE_PROXY_FACTORY", 0, "VoteProxyFactory",MCD_ADM.address);

  //6. 部署dss核心合约
  addrList = await dss_deploy_scripts(addrList,MCD_GOV,MCD_ADM,SpellRegistContract)

  //7. 部署治理代币鉴权器
  addrList = await deployMkrAuthority(addrList,MCD_GOV)

  //8. 启动治理
  addrList = await setGovernance(addrList,MCD_GOV,MCD_IOU,MCD_ADM)




}
async function setGovernance(addrList,MCD_GOV,MCD_IOU,MCD_ADM) {
  //mint Token （主网部署时分散80K到多个地址）
  //seth send "$MCD_GOV" 'mint(uint256)' "$(seth --to-uint256 "$(seth --to-wei 1000000 ETH)")"
  await sendTransaction("MCD_GOV",0,MCD_GOV.address,
      "mint",['uint256'],[ethers.utils.parseEther(configjson.govTokenMint)])

  //授权HOTT
  //seth send "$MCD_GOV" 'approve(address)' $MCD_ADM
  await sendTransaction("MCD_GOV",0,MCD_GOV.address,
      "approve",['address'],[addrList["MCD_ADM"].address])

  //授权IOU
  //seth send "$MCD_IOU" 'approve(address)' $MCD_ADM
  await sendTransaction("MCD_IOU",0,MCD_IOU.address,
      "approve",['address'],[addrList["MCD_ADM"].address])

  //锁定治理代币
  //seth send "$MCD_ADM" 'lock(uint256)' "$(seth --to-uint256 "$(seth --to-wei 1000000 ETH)")"
  await executeContract('MCD_ADM',0,MCD_ADM,'lock',ethers.utils.parseEther("1000000"))

  //投票给零地址
  //seth send "$MCD_ADM" 'vote(address[])' [0x0000000000000000000000000000000000000000]
  await sendTransaction("MCD_ADM",0,MCD_ADM.address,
      "vote",['address[]'],[["0x0000000000000000000000000000000000000000"]])

  //启动治理
  //seth send "$MCD_ADM" 'launch()'
  await executeContract('MCD_ADM',0,MCD_ADM,'launch')

  //放弃MCD_GOV 管理员权限 主网中
  //seth send "$MCD_GOV" 'setOwner(address)' 0x0000000000000000000000000000000000000000
  // await executeContract('MCD_GOV',0,MCD_GOV,'setOwner',"0x0000000000000000000000000000000000000000")

  return addrList;

}
async function deployMkrAuthority(addrList,MCD_GOV) {
  let GOV_GUARD = await deploy("GOV_GUARD", 0, "MkrAuthority");
  //设置代币鉴权器
  await executeContract('MCD_GOV',0,MCD_GOV,'setAuthority',GOV_GUARD.address)

  //允许MCD_FLOP铸造
  await executeContract('GOV_GUARD',0,GOV_GUARD,'rely',addrList["MCD_FLOP"].address)

  //允许开发者铸造 (生产环境去除该设置)
  // await executeContract('GOV_GUARD',0,GOV_GUARD,'rely',addrList["DEPLOYER"].address)

  //将权限转移给pause代理
  await executeContract('GOV_GUARD',0,GOV_GUARD,'setRoot',addrList["MCD_PAUSE_PROXY"].address)

  return addrList;

}
async function deployHouseTokenWrapper(addrList) {

  //部署HouseToken
  let HouseToken = await deploy("HouseToken", 0, "HouseToken");
  //部署HouseWrapper
  let HouseWrapper = await deploy("HouseWrapper", 0, "HouseWrapper");
  await executeContract('HouseToken',0,HouseToken,'setMinter',HouseWrapper.address)
  await executeContract('HouseWrapper',0,HouseWrapper,'setHouseToken',HouseToken.address)

  //部署SpellRegist
  let SpellRegist = await deploy(
      "SpellRegist",
      0,
      "SpellRegist",
      configjson.spellRegistline,
      configjson.spellRegistIndate,
      configjson.spellRegistSigners);
  return {addrList:addrList,SpellRegist:SpellRegist};
}

async function dss_deploy_scripts(addrList,MCD_GOV,MCD_ADM,SpellRegistContract) {
  //Deploy Multicall
  let MULTICALL = await deploy("MULTICALL", 0,"Multicall");

  //Deploy ProxyRegistry
  let PROXY_FACTORY = await deploy("PROXY_FACTORY", 0,"DSProxyFactory");
  let PROXY_REGISTRY = await deploy("PROXY_REGISTRY", 0,"ProxyRegistry", PROXY_FACTORY.address);

  //Deploy MCD Core Contratcs
  addrList = await dssDeploy(addrList,MCD_GOV,MCD_ADM)

  // Deploy Proxy Actions
  let PROXY_ACTIONS = await deploy("PROXY_ACTIONS", 0,"DssProxyActions");
  let PROXY_ACTIONS_END = await deploy("PROXY_ACTIONS_END", 0,"DssProxyActionsEnd");
  let PROXY_ACTIONS_DSR = await deploy("PROXY_ACTIONS_DSR", 0,"DssProxyActionsDsr");

  //Deploy CdpManager
  let CDP_MANAGER = await deploy("CDP_MANAGER", 0,"DssCdpManager", addrList["MCD_VAT"].address);
  let GET_CDPS = await deploy("GET_CDPS", 0,"GetCdps");

  //Deploy DsrManager
  let DSR_MANAGER = await deploy("DSR_MANAGER", 0,"DsrManager", addrList["MCD_POT"].address,addrList["MCD_JOIN_DAI"].address);

  //Deploy OsmMom
  let OSM_MOM = await deploy("OSM_MOM", 0,"OsmMom");

  //Deploy FlipperMom
  let FLIPPER_MOM = await deploy("FLIPPER_MOM", 0,"FlipperMom", addrList["MCD_CAT"].address);

  //Deploy IlkRegistry
  let ILK_REGISTRY = await deploy("ILK_REGISTRY", 0,"IlkRegistry", addrList["MCD_VAT"].address,addrList["MCD_CAT"].address,addrList["MCD_SPOT"].address);

  //Deploy GovActions - Library functions for the Pause
  let MCD_GOV_ACTIONS = await deploy("MCD_GOV_ACTIONS", 0,"GovActions");

  //Deploy Pause Proxy Actions (support contract for executing initial set up of the dss system)
  let PROXY_PAUSE_ACTIONS = await deploy("PROXY_PAUSE_ACTIONS", 0,"DssDeployPauseProxyActions");

  //Get a proxy for the deployer address (create if didn't previously exist)
  let ProxyDeployer = await PROXY_REGISTRY.proxies(addrList["DEPLOYER"].address)
  if(ProxyDeployer == "0x0000000000000000000000000000000000000000"){
    await sendTransaction("PROXY_REGISTRY",0,PROXY_REGISTRY.address,
        "build",[],[])
    ProxyDeployer = await PROXY_REGISTRY.proxies(addrList["DEPLOYER"].address)
    console.log('ProxyDeployer: ',ProxyDeployer)
  }
  addrList["PROXY_DEPLOYER"] =  {contract: "DSProxy", address:ProxyDeployer }

  //# Set the proxy address as root of the roles (in order to be able to do all the variables set up)
  //sethSend "$MCD_ADM" 'setRootUser(address,bool)' "$PROXY_DEPLOYER" true
  //合约修改了，这个setRootUser方法没有用了
  // await executeContract('MCD_ADM',0,MCD_ADM,'setRootUser',ProxyDeployer, true)

  //# Deploy DssAutoLine
  let MCD_IAM_AUTO_LINE = await deploy("MCD_IAM_AUTO_LINE", 0,"DssAutoLine", addrList["MCD_VAT"].address);

  //下面的操作需要权限，先进行ProxyDeployer的权限设置
  await addSpellRegist(ProxyDeployer,SpellRegistContract)
  let encodeData = await encodeFunction(
      "rely(address,address,address,address)",
      ['address','address','address','address'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_VAT"].address ,MCD_IAM_AUTO_LINE.address]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])

  //setters
  await setters(addrList,ProxyDeployer,PROXY_PAUSE_ACTIONS,MCD_GOV,MCD_ADM)

  return addrList;

}
async function addSpellRegist(addSpellAddr,SpellRegistContract) {
  await executeContract('SpellRegistContract',0,SpellRegistContract,'sendProposal',addSpellAddr,'ProxyDeployer')
  let lastId = await SpellRegistContract.lastId()
  await executeContract('SpellRegistContract',1,SpellRegistContract,'vote',lastId.toString())

}
async function setters(addrList,ProxyDeployer,PROXY_PAUSE_ACTIONS,MCD_GOV,MCD_ADM) {
  // "$LIBEXEC_DIR"/setters/set-vat-line
  //Line=$(jq -r ".vat_line | values" "$CONFIG_FILE")
  // if [[ "$Line" != "" && "$Line" != "0" ]]; then
  //     Line=$(echo "$Line"*10^45 | bc)
  //     Line=$(seth --to-uint256 "${Line%.*}")
  //     calldata="$(seth calldata 'file(address,address,address,bytes32,uint256)' "$MCD_PAUSE" "$MCD_GOV_ACTIONS" "$MCD_VAT" "$(seth --to-bytes32 "$(seth --from-ascii "Line")")" "$Line")"
  //     sethSend "$PROXY_DEPLOYER" 'execute(address,bytes memory)' "$PROXY_PAUSE_ACTIONS" "$calldata"
  // fi
  let vat_line = ethers.BigNumber.from(configjson.vat_line).mul(ethers.BigNumber.from('10').pow(45))
  let encodeData = await encodeFunction(
      "file(address,address,address,bytes32,uint256)",
      ['address','address','address','bytes32','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_VAT"].address ,web3.utils.utf8ToHex("Line"),vat_line.toString()]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])

  // "$LIBEXEC_DIR"/setters/set-vow-wait
  //wait=$(jq -r ".vow_wait | values" "$CONFIG_FILE")
  // if [[ "$wait" != "" ]]; then
  //     calldata="$(seth calldata 'file(address,address,address,bytes32,uint256)' "$MCD_PAUSE" "$MCD_GOV_ACTIONS" "$MCD_VOW" "$(seth --to-bytes32 "$(seth --from-ascii "wait")")" "$wait")"
  //     sethSend "$PROXY_DEPLOYER" 'execute(address,bytes memory)' "$PROXY_PAUSE_ACTIONS" "$calldata"
  // fi
  encodeData = await encodeFunction(
      "file(address,address,address,bytes32,uint256)",
      ['address','address','address','bytes32','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_VOW"].address ,web3.utils.utf8ToHex("wait"),configjson.vow_wait]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])

  // "$LIBEXEC_DIR"/setters/set-vow-bump
  //bump=$(jq -r ".vow_bump | values" "$CONFIG_FILE")
  // if [[ "$bump" != "" ]]; then
  //     bump=$(echo "$bump"*10^45 | bc)
  //     bump=$(seth --to-uint256 "${bump%.*}")
  //     calldata="$(seth calldata 'file(address,address,address,bytes32,uint256)' "$MCD_PAUSE" "$MCD_GOV_ACTIONS" "$MCD_VOW" "$(seth --to-bytes32 "$(seth --from-ascii "bump")")" "$bump")"
  //     sethSend "$PROXY_DEPLOYER" 'execute(address,bytes memory)' "$PROXY_PAUSE_ACTIONS" "$calldata"
  // fi
  let bump = ethers.BigNumber.from(configjson.vow_bump).mul(ethers.BigNumber.from('10').pow(45))
  encodeData = await encodeFunction(
      "file(address,address,address,bytes32,uint256)",
      ['address','address','address','bytes32','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_VOW"].address ,web3.utils.utf8ToHex("bump"),bump]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])

  // "$LIBEXEC_DIR"/setters/set-vow-dump
  //dump=$(jq -r ".vow_dump" "$CONFIG_FILE")
  // if [[ "$dump" != "" ]]; then
  //     dump=$(echo "$dump"*10^18 | bc)
  //     dump=$(seth --to-uint256 "${dump%.*}")
  //     calldata="$(seth calldata 'file(address,address,address,bytes32,uint256)' "$MCD_PAUSE" "$MCD_GOV_ACTIONS" "$MCD_VOW" "$(seth --to-bytes32 "$(seth --from-ascii "dump")")" "$dump")"
  //     sethSend "$PROXY_DEPLOYER" 'execute(address,bytes memory)' "$PROXY_PAUSE_ACTIONS" "$calldata"
  // fi
  encodeData = await encodeFunction(
      "file(address,address,address,bytes32,uint256)",
      ['address','address','address','bytes32','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_VOW"].address ,web3.utils.utf8ToHex("dump"),ethers.utils.parseEther(configjson.vow_dump)]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])

  // "$LIBEXEC_DIR"/setters/set-vow-sump
  //sump=$(jq -r ".vow_sump" "$CONFIG_FILE")
  // if [[ "$sump" != "" ]]; then
  //     sump=$(echo "$sump"*10^45 | bc)
  //     sump=$(seth --to-uint256 "${sump%.*}")
  //     calldata="$(seth calldata 'file(address,address,address,bytes32,uint256)' "$MCD_PAUSE" "$MCD_GOV_ACTIONS" "$MCD_VOW" "$(seth --to-bytes32 "$(seth --from-ascii "sump")")" "$sump")"
  //     sethSend "$PROXY_DEPLOYER" 'execute(address,bytes memory)' "$PROXY_PAUSE_ACTIONS" "$calldata"
  // fi
  let sump = ethers.BigNumber.from(configjson.vow_sump).mul(ethers.BigNumber.from('10').pow(45))
  encodeData = await encodeFunction(
      "file(address,address,address,bytes32,uint256)",
      ['address','address','address','bytes32','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_VOW"].address ,web3.utils.utf8ToHex("sump"),sump]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])

  // "$LIBEXEC_DIR"/setters/set-vow-hump
  //hump=$(jq -r ".vow_hump | values" "$CONFIG_FILE")
  // if [[ "$hump" != "" ]]; then
  //     hump=$(echo "$hump"*10^45 | bc)
  //     hump=$(seth --to-uint256 "${hump%.*}")
  //     calldata="$(seth calldata 'file(address,address,address,bytes32,uint256)' "$MCD_PAUSE" "$MCD_GOV_ACTIONS" "$MCD_VOW" "$(seth --to-bytes32 "$(seth --from-ascii "hump")")" "$hump")"
  //     sethSend "$PROXY_DEPLOYER" 'execute(address,bytes memory)' "$PROXY_PAUSE_ACTIONS" "$calldata"
  // fi
  let hump = ethers.BigNumber.from(configjson.vow_hump).mul(ethers.BigNumber.from('10').pow(45))
  encodeData = await encodeFunction(
      "file(address,address,address,bytes32,uint256)",
      ['address','address','address','bytes32','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_VOW"].address ,web3.utils.utf8ToHex("hump"),hump]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])

  // "$LIBEXEC_DIR"/setters/set-cat-box
  //box=$(jq -r ".cat_box | values" "$CONFIG_FILE")
  // if [[ "$box" != "" && "$box" != "0" ]]; then
  //     box=$(echo "$box"*10^45 | bc)
  //     box=$(seth --to-uint256 "${box%.*}")
  //     calldata="$(seth calldata 'file(address,address,address,bytes32,uint256)' "$MCD_PAUSE" "$MCD_GOV_ACTIONS" "$MCD_CAT" "$(seth --to-bytes32 "$(seth --from-ascii "box")")" "$box")"
  //     sethSend "$PROXY_DEPLOYER" 'execute(address,bytes memory)' "$PROXY_PAUSE_ACTIONS" "$calldata"
  // fi
  let box = ethers.BigNumber.from(configjson.cat_box).mul(ethers.BigNumber.from('10').pow(45))
  encodeData = await encodeFunction(
      "file(address,address,address,bytes32,uint256)",
      ['address','address','address','bytes32','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_CAT"].address ,web3.utils.utf8ToHex("box"),box]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])

  // "$LIBEXEC_DIR"/setters/set-jug-base
  //base=$(jq -r ".jug_base | values" "$CONFIG_FILE")
  // if [[ "$base" != "" ]]; then
  //     base=$(bc -l <<< "scale=27; e( l(${base} / 100 + 1)/(60 * 60 * 24 * 365)) * 10^27")
  //     base=$(bc -l <<< "${base} - 10^27")
  //     base=$(seth --to-uint256 "${base%.*}")
  //     calldata="$(seth calldata 'file(address,address,address,bytes32,uint256)' "$MCD_PAUSE" "$MCD_GOV_ACTIONS" "$MCD_JUG" "$(seth --to-bytes32 "$(seth --from-ascii "base")")" "$base")"
  //     sethSend "$PROXY_DEPLOYER" 'execute(address,bytes memory)' "$PROXY_PAUSE_ACTIONS" "$calldata"
  // fi
  const base = configjson.jug_base;
  let truncatedBase = "0"; // 初始化为字符串 "0"
  if (base !== "") {
    const baseInExponential = execSync(`echo "scale=27; e( l(${base} / 100 + 1)/(60 * 60 * 24 * 365)) * 10^27" | bc -l`).toString().trim();
    let modifiedBase = execSync(`echo "${baseInExponential} - 10^27" | bc -l`).toString().trim();
    truncatedBase = modifiedBase.split(".")[0]
    //console.log("baseInUint256", truncatedBase);
  }
  encodeData = await encodeFunction(
      "file(address,address,address,bytes32,uint256)",
      ['address','address','address','bytes32','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_JUG"].address ,web3.utils.utf8ToHex("base"),truncatedBase]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])

  // "$LIBEXEC_DIR"/setters/set-pot-dsr
  //dsr=$(jq -r ".pot_dsr | values" "$CONFIG_FILE")
  // if [[ "$dsr" != "" ]]; then
  //     dsr=$(bc -l <<< "scale=27; e( l(${dsr} / 100 + 1)/(60 * 60 * 24 * 365)) * 10^27")
  //     dsr=$(seth --to-uint256 "${dsr%.*}")
  //     calldata="$(seth calldata 'dripAndFile(address,address,address,bytes32,uint256)' "$MCD_PAUSE" "$MCD_GOV_ACTIONS" "$MCD_POT" "$(seth --to-bytes32 "$(seth --from-ascii "dsr")")" "$dsr")"
  //     sethSend "$PROXY_DEPLOYER" 'execute(address,bytes memory)' "$PROXY_PAUSE_ACTIONS" "$calldata"
  // fi
  const dsr = configjson.pot_dsr;
  let truncatedDsr = "0"; // 初始化为字符串 "0"
  if (dsr !== "") {
    truncatedDsr = calcYearRate(dsr)
    // console.log("baseInUint256", truncatedDsr);
  }
  encodeData = await encodeFunction(
      "dripAndFile(address,address,address,bytes32,uint256)",
      ['address','address','address','bytes32','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_POT"].address ,web3.utils.utf8ToHex("dsr"),truncatedDsr]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])

  // "$LIBEXEC_DIR"/setters/set-end-wait
  //wait=$(jq -r ".end_wait | values" "$CONFIG_FILE")
  // if [[ "$wait" != "" ]]; then
  //     calldata="$(seth calldata 'file(address,address,address,bytes32,uint256)' "$MCD_PAUSE" "$MCD_GOV_ACTIONS" "$MCD_END" "$(seth --to-bytes32 "$(seth --from-ascii "wait")")" "$wait")"
  //     sethSend "$PROXY_DEPLOYER" 'execute(address,bytes memory)' "$PROXY_PAUSE_ACTIONS" "$calldata"
  // fi
  encodeData = await encodeFunction(
      "file(address,address,address,bytes32,uint256)",
      ['address','address','address','bytes32','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_END"].address ,web3.utils.utf8ToHex("wait"),configjson.end_wait]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])

  // "$LIBEXEC_DIR"/setters/set-beg "flap"
  //beg=$(jq -r ".$1_beg | values" "$CONFIG_FILE")
  // if [[ "$beg" != "" ]]; then
  //     beg=$(echo "($beg+100)"*10^16 | bc -l)
  //     beg=$(seth --to-uint256 "${beg%.*}")
  //     calldata="$(seth calldata 'file(address,address,address,bytes32,uint256)' "$MCD_PAUSE" "$MCD_GOV_ACTIONS" "$(eval echo "\$MCD_$(toUpper "$1")")" "$(seth --to-bytes32 "$(seth --from-ascii "beg")")" "$beg")"
  //     sethSend "$PROXY_DEPLOYER" 'execute(address,bytes memory)' "$PROXY_PAUSE_ACTIONS" "$calldata"
  // fi
  const begAsBigNumber = new BigNumber(configjson.flap_beg).plus(100).times(1e16);
  const begInUint256 = begAsBigNumber.integerValue().toFixed(0, BigNumber.ROUND_DOWN);
  encodeData = await encodeFunction(
      "file(address,address,address,bytes32,uint256)",
      ['address','address','address','bytes32','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_FLAP"].address ,web3.utils.utf8ToHex("beg"),begInUint256]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])


  // "$LIBEXEC_DIR"/setters/set-ttl "flap"
  //ttl=$(jq -r ".$1_ttl | values" "$CONFIG_FILE")
  //if [[ "$ttl" != "" ]]; then
  //     calldata="$(seth calldata 'file(address,address,address,bytes32,uint256)' "$MCD_PAUSE" "$MCD_GOV_ACTIONS" "$(eval echo "\$MCD_$(toUpper "$1")")" "$(seth --to-bytes32 "$(seth --from-ascii "ttl")")" "$ttl")"
  //     sethSend "$PROXY_DEPLOYER" 'execute(address,bytes memory)' "$PROXY_PAUSE_ACTIONS" "$calldata"
  // fi
  encodeData = await encodeFunction(
      "file(address,address,address,bytes32,uint256)",
      ['address','address','address','bytes32','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_FLAP"].address ,web3.utils.utf8ToHex("ttl"),configjson.flap_ttl]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])

  // "$LIBEXEC_DIR"/setters/set-tau "flap"
  //tau=$(jq -r ".$1_tau | values" "$CONFIG_FILE")
  // if [[ "$tau" != "" ]]; then
  //     calldata="$(seth calldata 'file(address,address,address,bytes32,uint256)' "$MCD_PAUSE" "$MCD_GOV_ACTIONS" "$(eval echo "\$MCD_$(toUpper "$1")")" "$(seth --to-bytes32 "$(seth --from-ascii "tau")")" "$tau")"
  //     sethSend "$PROXY_DEPLOYER" 'execute(address,bytes memory)' "$PROXY_PAUSE_ACTIONS" "$calldata"
  // fi
  encodeData = await encodeFunction(
      "file(address,address,address,bytes32,uint256)",
      ['address','address','address','bytes32','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_FLAP"].address ,web3.utils.utf8ToHex("tau"),configjson.flap_tau]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])

  // "$LIBEXEC_DIR"/setters/set-beg "flop"
  const begAsBigNumberflop = new BigNumber(configjson.flop_beg).plus(100).times(1e16);
  const begInUint256flop = begAsBigNumberflop.integerValue().toFixed(0, BigNumber.ROUND_DOWN);
  encodeData = await encodeFunction(
      "file(address,address,address,bytes32,uint256)",
      ['address','address','address','bytes32','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_FLOP"].address ,web3.utils.utf8ToHex("beg"),begInUint256flop]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])

  // "$LIBEXEC_DIR"/setters/set-flop-pad
  //pad=$(jq -r ".flop_pad | values" "$CONFIG_FILE")
  // if [[ "$pad" != "" ]]; then
  //     pad=$(echo "($pad+100)"*10^16 | bc -l)
  //     pad=$(seth --to-uint256 "${pad%.*}")
  //     calldata="$(seth calldata 'file(address,address,address,bytes32,uint256)' "$MCD_PAUSE" "$MCD_GOV_ACTIONS" "$MCD_FLOP" "$(seth --to-bytes32 "$(seth --from-ascii "pad")")" "$pad")"
  //     sethSend "$PROXY_DEPLOYER" 'execute(address,bytes memory)' "$PROXY_PAUSE_ACTIONS" "$calldata"
  // fi
  const begAsBigNumberpad = new BigNumber(configjson.flop_pad).plus(100).times(1e16);
  const begInUint256pad = begAsBigNumberpad.integerValue().toFixed(0, BigNumber.ROUND_DOWN);
  encodeData = await encodeFunction(
      "file(address,address,address,bytes32,uint256)",
      ['address','address','address','bytes32','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_FLOP"].address ,web3.utils.utf8ToHex("pad"),begInUint256pad]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])

  // "$LIBEXEC_DIR"/setters/set-ttl "flop"
  encodeData = await encodeFunction(
      "file(address,address,address,bytes32,uint256)",
      ['address','address','address','bytes32','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_FLOP"].address ,web3.utils.utf8ToHex("ttl"),configjson.flop_ttl]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])

  // "$LIBEXEC_DIR"/setters/set-tau "flop"
  encodeData = await encodeFunction(
      "file(address,address,address,bytes32,uint256)",
      ['address','address','address','bytes32','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_FLOP"].address ,web3.utils.utf8ToHex("tau"),configjson.flop_tau]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])

  // "$LIBEXEC_DIR"/setters/set-ilks-price
  //
  // "$LIBEXEC_DIR"/setters/set-ilks-pip-whitelist
  //
  // "$LIBEXEC_DIR"/setters/set-ilks-mat
  //
  // "$LIBEXEC_DIR"/setters/set-ilks-line
  //sethSend "$MCD_IAM_AUTO_LINE" 'rely(address)' "$MCD_PAUSE_PROXY"
  // sethSend "$MCD_IAM_AUTO_LINE" 'deny(address)' "$ETH_FROM"
  await sendTransaction("MCD_IAM_AUTO_LINE",0,addrList["MCD_IAM_AUTO_LINE"].address,
      "rely",['address'],[addrList["MCD_PAUSE_PROXY"].address])
  await sendTransaction("MCD_IAM_AUTO_LINE",0,addrList["MCD_IAM_AUTO_LINE"].address,
      "deny",['address'],[addrList["DEPLOYER"].address])

  // "$LIBEXEC_DIR"/setters/set-ilks-dust
  //
  // "$LIBEXEC_DIR"/setters/set-ilks-duty
  //
  // "$LIBEXEC_DIR"/setters/set-ilks-spotter-poke
  //
  // "$LIBEXEC_DIR"/setters/set-ilks-chop
  //
  // "$LIBEXEC_DIR"/setters/set-ilks-dunk
  //
  // "$LIBEXEC_DIR"/setters/set-ilks-beg
  //
  // "$LIBEXEC_DIR"/setters/set-ilks-ttl
  //
  // "$LIBEXEC_DIR"/setters/set-ilks-tau
  //
  // "$LIBEXEC_DIR"/setters/set-ilks-faucet
  //
  // if [[ -f "$CASE" ]]; then
  // "$CASE"
  // fi
  //
  // "$LIBEXEC_DIR"/setters/set-ilks-osm
  //
  // "$LIBEXEC_DIR"/setters/set-ilks-osm-mom
  //sethSend "$OSM_MOM" 'setAuthority(address)' "$MCD_ADM"
  // sethSend "$OSM_MOM" 'setOwner(address)' "$MCD_PAUSE_PROXY"
  await sendTransaction("OSM_MOM",0,addrList["OSM_MOM"].address,
      "setAuthority",['address'],[addrList["MCD_ADM"].address])
  await sendTransaction("OSM_MOM",0,addrList["OSM_MOM"].address,
      "setOwner",['address'],[addrList["MCD_PAUSE_PROXY"].address])

  // "$LIBEXEC_DIR"/setters/set-ilks-flipper-mom
  //sethSend "$FLIPPER_MOM" 'setAuthority(address)' "$MCD_ADM"
  // sethSend "$FLIPPER_MOM" 'setOwner(address)' "$MCD_PAUSE_PROXY"
  await sendTransaction("FLIPPER_MOM",0,addrList["FLIPPER_MOM"].address,
      "setAuthority",['address'],[addrList["MCD_ADM"].address])
  await sendTransaction("FLIPPER_MOM",0,addrList["FLIPPER_MOM"].address,
      "setOwner",['address'],[addrList["MCD_PAUSE_PROXY"].address])

  // "$LIBEXEC_DIR"/setters/set-pause-auth-delay
  // calldata="$(seth calldata 'setAuthorityAndDelay(address,address,address,uint256)' "$MCD_PAUSE" "$MCD_GOV_ACTIONS" "$MCD_ADM" "$(seth --to-uint256 "$delay")")"
  // sethSend "$PROXY_DEPLOYER" 'execute(address,bytes memory)' "$PROXY_PAUSE_ACTIONS" "$calldata"
  encodeData = await encodeFunction(
      "setAuthorityAndDelay(address,address,address,uint256)",
      ['address','address','address','uint256'],
      [addrList["MCD_PAUSE"].address, addrList["MCD_GOV_ACTIONS"].address, addrList["MCD_ADM"].address ,configjson.pauseDelay]);
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "execute",['address', 'bytes'],[PROXY_PAUSE_ACTIONS.address,encodeData])
  //放弃合约权限
  await sendTransaction("ProxyDeployer",0,ProxyDeployer,
      "setOwner",['address'],['0x0000000000000000000000000000000000000000'])


}
async function dssDeploy(addrList,MCD_GOV,MCD_ADM) {
  //# Deploy VAT
  // sethSend "$MCD_DEPLOY" "deployVat()"
  let MCD_VAT = await deploy("MCD_VAT", 0,"Vat");

  let MCD_SPOT = await deploy("MCD_SPOT", 0,"Spotter",MCD_VAT.address);
  await executeContract('MCD_VAT',0,MCD_VAT,'rely',MCD_SPOT.address)

  //Deploy MCD
  // sethSend "$MCD_DEPLOY" "deployDai(uint256)" "$(seth rpc net_version)"
  const chainId = await network.provider.send("eth_chainId");
  console.log("Chain ID:", chainId);
  let MCD_DAI = await deploy("MCD_DAI", 0,"Dai",chainId);

  let MCD_JOIN_DAI = await deploy("MCD_JOIN_DAI", 0,"DaiJoin",MCD_VAT.address,MCD_DAI.address);
  await executeContract('MCD_DAI',0,MCD_DAI,'rely',MCD_JOIN_DAI.address)

  //Deploy Taxation
  // sethSend "$MCD_DEPLOY" "deployTaxation()"
  let MCD_JUG = await deploy("MCD_JUG", 0,"Jug",MCD_VAT.address);

  let MCD_POT = await deploy("MCD_POT", 0,"Pot",MCD_VAT.address);
  await executeContract('MCD_VAT',0,MCD_VAT,'rely',MCD_JUG.address)
  await executeContract('MCD_VAT',0,MCD_VAT,'rely',MCD_POT.address)

  //Deploy Auctions
  // sethSend "$MCD_DEPLOY" "deployAuctions(address)" "$MCD_GOV"
  let MCD_FLAP = await deploy("MCD_FLAP", 0,"Flapper",MCD_VAT.address,MCD_GOV.address);

  let MCD_FLOP = await deploy("MCD_FLOP", 0,"Flopper",MCD_VAT.address,MCD_GOV.address);

  let MCD_VOW = await deploy("MCD_VOW", 0,"Vow",MCD_VAT.address,MCD_FLAP.address,MCD_FLOP.address);
  await sendTransaction("MCD_JUG",0,MCD_JUG.address,
      "file",['bytes32','address'],[web3.utils.utf8ToHex("vow"),MCD_VOW.address])
  await sendTransaction("MCD_POT",0,MCD_POT.address,
      "file",['bytes32','address'],[web3.utils.utf8ToHex("vow"),MCD_VOW.address])
  await executeContract('MCD_VAT',0,MCD_VAT,'rely',MCD_FLOP.address)
  await executeContract('MCD_FLAP',0,MCD_FLAP,'rely',MCD_VOW.address)
  await executeContract('MCD_FLOP',0,MCD_FLOP,'rely',MCD_VOW.address)

  // Deploy Liquidation
  // sethSend "$MCD_DEPLOY" "deployLiquidator()"
  let MCD_CAT = await deploy("MCD_CAT", 0,"Cat",MCD_VAT.address);
  await sendTransaction("MCD_CAT",0,MCD_CAT.address,
      "file",['bytes32','address'],[web3.utils.utf8ToHex("vow"),MCD_VOW.address])
  await executeContract('MCD_VAT',0,MCD_VAT,'rely',MCD_CAT.address)
  await executeContract('MCD_VOW',0,MCD_VOW,'rely',MCD_CAT.address)

  //# Deploy End
  // MCD_ESM_PIT=${MCD_ESM_PIT:-"0x0000000000000000000000000000000000000000"}
  // MCD_ESM_MIN=${MCD_ESM_MIN:-"$(seth --to-uint256 "$(seth --to-wei 50000 "eth")")"}
  // sethSend "$MCD_DEPLOY" "deployShutdown(address,address,uint256)" "$MCD_GOV" "$MCD_ESM_PIT" "$MCD_ESM_MIN"
  let MCD_END = await deploy("MCD_END", 0,"End");
  await sendTransaction("MCD_END",0,MCD_END.address,
      "file",['bytes32','address'],[web3.utils.utf8ToHex("vat"),MCD_VAT.address])
  await sendTransaction("MCD_END",0,MCD_END.address,
      "file",['bytes32','address'],[web3.utils.utf8ToHex("cat"),MCD_CAT.address])
  await sendTransaction("MCD_END",0,MCD_END.address,
      "file",['bytes32','address'],[web3.utils.utf8ToHex("vow"),MCD_VOW.address])
  await sendTransaction("MCD_END",0,MCD_END.address,
      "file",['bytes32','address'],[web3.utils.utf8ToHex("pot"),MCD_POT.address])
  await sendTransaction("MCD_END",0,MCD_END.address,
      "file",['bytes32','address'],[web3.utils.utf8ToHex("spot"),MCD_SPOT.address])
  await executeContract('MCD_VAT',0,MCD_VAT,'rely',MCD_END.address)
  await executeContract('MCD_CAT',0,MCD_CAT,'rely',MCD_END.address)
  await executeContract('MCD_VOW',0,MCD_VOW,'rely',MCD_END.address)
  await executeContract('MCD_POT',0,MCD_POT,'rely',MCD_END.address)
  await executeContract('MCD_SPOT',0,MCD_SPOT,'rely',MCD_END.address)

  let MCD_ESM = await deploy("MCD_ESM", 0,"ESM",MCD_GOV.address,MCD_END.address,"0x0000000000000000000000000000000000000000",ethers.utils.parseEther(configjson.esm_min));
  await executeContract('MCD_END',0,MCD_END,'rely',MCD_ESM.address)

  //Deploy pause
  // MCD_PAUSE_DELAY=${MCD_PAUSE_DELAY:-"3600"}
  //sethSend "$MCD_DEPLOY" "deployPause(uint256,address)" "$(seth --to-uint256 "$MCD_PAUSE_DELAY")" "$MCD_ADM"
  //设置MCD_PAUSE_DELAY=0,配置中的也是0
  let MCD_PAUSE = await deploy("MCD_PAUSE", 0,"DSPause",configjson.pauseDelay,'0x0000000000000000000000000000000000000000',MCD_ADM.address);
  let DSPauseProxy = await MCD_PAUSE.proxy()
  addrList["MCD_PAUSE_PROXY"] = {contract: "DSPauseProxy", address:DSPauseProxy }
  await executeContract('MCD_DAI',0,MCD_DAI,'rely',DSPauseProxy)
  await executeContract('MCD_VAT',0,MCD_VAT,'rely',DSPauseProxy)
  await executeContract('MCD_CAT',0,MCD_CAT,'rely',DSPauseProxy)
  await executeContract('MCD_VOW',0,MCD_VOW,'rely',DSPauseProxy)
  await executeContract('MCD_JUG',0,MCD_JUG,'rely',DSPauseProxy)
  await executeContract('MCD_POT',0,MCD_POT,'rely',DSPauseProxy)
  await executeContract('MCD_SPOT',0,MCD_SPOT,'rely',DSPauseProxy)
  await executeContract('MCD_FLAP',0,MCD_FLAP,'rely',DSPauseProxy)
  await executeContract('MCD_FLOP',0,MCD_FLOP,'rely',DSPauseProxy)
  await executeContract('MCD_END',0,MCD_END,'rely',DSPauseProxy)

  //主网上放弃合约控制权
  // await executeContract('MCD_DAI',0,MCD_DAI,'deny',addrList["DEPLOYER"].address)
  // await executeContract('MCD_JOIN_DAI',0,MCD_JOIN_DAI,'deny',addrList["DEPLOYER"].address)
  // await executeContract('MCD_VAT',0,MCD_VAT,'deny',addrList["DEPLOYER"].address)
  // await executeContract('MCD_CAT',0,MCD_CAT,'deny',addrList["DEPLOYER"].address)
  // await executeContract('MCD_VOW',0,MCD_VOW,'deny',addrList["DEPLOYER"].address)
  // await executeContract('MCD_JUG',0,MCD_JUG,'deny',addrList["DEPLOYER"].address)
  // await executeContract('MCD_POT',0,MCD_POT,'deny',addrList["DEPLOYER"].address)
  // await executeContract('MCD_SPOT',0,MCD_SPOT,'deny',addrList["DEPLOYER"].address)
  // await executeContract('MCD_FLAP',0,MCD_FLAP,'deny',addrList["DEPLOYER"].address)
  // await executeContract('MCD_FLOP',0,MCD_FLOP,'deny',addrList["DEPLOYER"].address)
  // await executeContract('MCD_END',0,MCD_END,'deny',addrList["DEPLOYER"].address)

  return addrList;

}

function convertToObject(inputObject) {
  let outputObject={}
  for (const key in inputObject) {
    if (inputObject.hasOwnProperty(key)) {
      outputObject[key] = inputObject[key].address;
    }
  }
  outputObject["FAUCET"] = "0x0000000000000000000000000000000000000000"
  outputObject["MCD_JOIN_SAI"] = "0x0000000000000000000000000000000000000000"
  outputObject["OLD_MCD_CAT"] = "0x0000000000000000000000000000000000000000"
  outputObject["MIGRATION"] = "0x0000000000000000000000000000000000000000"
  outputObject["MIGRATION_PROXY_ACTIONS"] = "0x0000000000000000000000000000000000000000"
  console.log(outputObject)
}
function calcYearRate(yearRate) {
  const baseInExponential = execSync(`echo "scale=27; e( l(${yearRate} / 100 + 1)/(60 * 60 * 24 * 365)) * 10^27" | bc -l`).toString().trim();
  return  baseInExponential.split(".")[0]
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  saveAddr(addrList)
  console.error(error);
  process.exitCode = 1;
});
