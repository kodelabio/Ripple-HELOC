const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const hre = require("hardhat");

async function main() {
    const network = process.argv.slice(2)
    var data=fs.readFileSync('./out/address.json','utf-8');
    const addres = JSON.parse(data.toString());
    let filejson= getAllFilePathsInFolder('./contracts/')
    console.log(filejson)
    let param
    let command = `npx hardhat clean\n`
    for (var val in addres) {
        let paramfiletoLower = addres[val].contract.toLowerCase()
        let paramfile = paramfiletoLower +'.sol'
        //console.log(paramfile)
        param = filejson[paramfile]
        if(param==undefined){
            console.log(`< ${val} > contract file not exist `)
            command = command + `npx hardhat --network ${network[0]} verify ${addres[val].address} --contract ${param}:${addres[val].contract} --constructor-args  ./param/${val}.js\n`

        }else {
            command = command + `npx hardhat --network ${network[0]} verify ${addres[val].address} --contract ${param}:${addres[val].contract} --constructor-args  ./param/${val}.js\n`
        }

        //command = command + `npx hardhat --network ${network[0]} verify ${addres[val].address} --contract ${addres[param]}:${addres[val].contract} --constructor-args  ./param/${paramfile}\n`

    }
    //console.log(command)
     await execShell(command)
}
function getAllFilePathsInFolder(folderPath) {
    function getFilesRecursively(folderPath) {
        const files = fs.readdirSync(folderPath);
        const filePaths = files.map(file => path.join(folderPath, file));

        const directories = filePaths.filter(filePath => fs.statSync(filePath).isDirectory());
        const subFiles = directories.reduce((acc, dir) => acc.concat(getFilesRecursively(dir)), []);

        return [...filePaths.filter(filePath => !directories.includes(filePath)), ...subFiles];
    }

    const filePaths = getFilesRecursively(folderPath);
    return filePaths.reduce((result, filePath) => {
        let fileName = path.basename(filePath);
        fileName = fileName.toLowerCase()
        result[fileName] = filePath;
        return result;
    }, {});
}


async function execShell(command) {
    let sh = spawn('sh', ['-c', command]);
    console.log(`Shell Command: ${command}`)
    sh.stdout.on('data', (data) => {
        console.log(`${data}`);
    });

    sh.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });

    sh.on('close', (code) => {
        console.log(`contract verfy exit!`);
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});







