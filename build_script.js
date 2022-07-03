const settings = require('./settings')
const util = require('./util')

const fs = require('fs');
const path = require('path')
const child_process = require('child_process')

exports.build = async function() {
    console.log(`Downloading files`)
    await Promise.all([
        util.downloadFile(settings.MYSQL_URL,'build/mysql.zip'),
        util.downloadFile(settings.BOOST_URL,'build/boost.zip'),
        util.downloadFile(settings.OPENSSL_URL,'build/openssl.zip'),
        util.downloadFile(settings.TDB_URL, 'build/tdb.7z'),
        util.downloadFile(settings.SZIP_URL, 'build/7zip.zip')
    ])

    console.log(`Extracting files`)
    await Promise.all([
        util.extract('build/mysql.zip','install/mysql'),
        util.extract('build/7zip.zip','build/7zip'),
        util.extract('build/boost.zip','build/boost'),
        util.extract('build/openssl.zip','build/openssl')
    ])

    console.log(`Extracting tdb`)
    if(!fs.existsSync('build/tdb')) {
        child_process.execSync(`"build/7zip/7za.exe" e -o${"build/tdb"} build/tdb.7z`);
    }

    let tdb = path.resolve(util.findSub('build/tdb'))
    fs.copyFileSync(tdb,'install/tdb.sql')
    let mysql = path.resolve(util.findSub('install/mysql'))
    let openssl = path.resolve('build/openssl')
    let boost = path.resolve('build/boost')

    console.log(`Running CMake`)
    util.exec(`cmake 
        -S "${path.resolve('./TrinityCore')}"
        -B "${path.resolve('build/trinitycore')}"
        -DMYSQL_INCLUDE_DIR="${mysql}/include"
        -DMYSQL_LIBRARY="${mysql}/lib/libmysql.lib"
        -DOPENSSL_INCLUDE_DIR="${openssl}/include"
        -DOPENSSL_ROOT_DIR="${openssl}"
        -DBOOST_ROOT="${boost}"
    `)

    console.log(`Building TrinityCore`)
    util.exec(`cmake --build build/trinitycore --config ${settings.BUILD_TYPE}`)
    util.copyFolderRecursiveSync(path.join('build/trinitycore/bin/',settings.BUILD_TYPE),'install/trinitycore')
    util.copyFileSync(
        'install/trinitycore/worldserver.conf.dist',
        'install/trinitycore/worldserver.conf'
    )
    util.copyFileSync(
        'install/trinitycore/authserver.conf.dist',
        'install/trinitycore/authserver.conf'
    )

    fs.readdirSync('build/openssl').forEach(x=>{
        let full = path.join('build/openssl',x)
        if(x.endsWith('.dll')) {
            fs.copyFileSync(full,path.join('install/trinitycore',x))
        }
    })

    fs.copyFileSync(path.join(mysql,'lib/libmysql.dll'),'install/trinitycore/libmysql.dll')
    util.copyFolderRecursiveSync('TrinityCore/sql','install/sql')
    if(fs.existsSync('install/sql/old')) {
        fs.rmSync('install/sql/old',{recursive:true})
    }
}