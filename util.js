const child_process = require('child_process')
const extract_zip = require('extract-zip')
const fs = require('fs')
const path = require('path')
const Downloader = require('nodejs-file-downloader')

exports.exec = function(command) {
    child_process.execSync(command.split('\r').join('').split('\n').join(' ').split(/ +/).join(' '),{stdio:'inherit'})
}

exports.removeIfExists = function(path) {
    if(fs.existsSync(path)) {
        fs.rmSync(path,{recursive:true})
    }
}

exports.doIn = function(pathIn,callback) {
    let old = path.resolve(process.cwd());
    process.chdir(pathIn)
    try {
        callback();
    } catch(err) {
        process.chdir(old);
        throw err;
    }
    process.chdir(old);
}

exports.downloadFile = async function(url, file) {
    if(fs.existsSync(file)) {
        return;
    }

    try {
        console.log(`Downloading ${url}`)
        await new Downloader(
            {
                url
                , fileName: path.basename(file)
                , directory: path.dirname(file)
                , cloneFiles: false
                , maxAttempts: 3
            }
        ).download();
        console.log(`Finished downloading ${url}`)
    } catch(error) {
        console.error(`Failed to download ${url}: ${error.message}`)
        process.exit(-1)
    }
}

exports.extract = function(zip,dir) {
    let parent = path.dirname(dir);
    if(!fs.existsSync(parent)) {
        fs.mkdirSync(parent)
    }

    if(fs.existsSync(dir)) {
        return;
    }
    console.log(`Extracting ${zip} to ${dir}`)
    return extract_zip(zip,{dir:path.resolve(dir)})
}

exports.findSub = function(dir) {
    let children = fs.readdirSync(dir);
    if(children.length === 0) {
        console.error(`Directory ${dir} has no children`)
        process.exit(-1)
    }

    if(children.length > 1) {
        console.error(`Directory ${dir} has multiple children`)
        process.exit(-1)
    }
    return path.join(dir,children[0])
}

exports.sleep = function(time) {
    return new Promise((res)=> {
        setTimeout(()=>res(),time)
    });
}

exports.copyFileSync = function( source, target ) {
    var targetFile = target;

    // If target is a directory, a new file with the same name will be created
    if ( fs.existsSync( target ) ) {
        if ( fs.lstatSync( target ).isDirectory() ) {
            targetFile = path.join( target, path.basename( source ) );
        }
    }

    fs.writeFileSync(targetFile, fs.readFileSync(source));
}

exports.copyFolderRecursiveSync = function( source, target ) {
    var files = [];

    // Check if folder needs to be created or integrated
    var targetFolder = path.join( target );
    if ( !fs.existsSync( targetFolder ) ) {
        fs.mkdirSync( targetFolder , {recursive: true});
    }

    // Copy
    if ( fs.lstatSync( source ).isDirectory() ) {
        files = fs.readdirSync( source );
        files.forEach( function ( file ) {
            var curSource = path.join( source, file );
            if ( fs.lstatSync( curSource ).isDirectory() ) {
                exports.copyFolderRecursiveSync( curSource, path.join(targetFolder,file) );
            } else {
                exports.copyFileSync( curSource, targetFolder );
            }
        } );
    }
}