const settings = require('./settings')
const util = require('./util')
const Octokit = require('octokit').Octokit
const fs = require('fs');
const path = require('path')
const child_process = require('child_process')

async function build() {
    // ================================
    //
    // Patch tc to allow compiling on vs2019+
    //
    // ================================
    const TASK_SCHEDULER_FILE = 'TrinityCore/src/common/Utilities/TaskScheduler.h'
    let TaskScheduler_h = fs.readFileSync(TASK_SCHEDULER_FILE,'utf-8')
        .split('\r').join('')
        .split('\n')
    let index = TaskScheduler_h.findIndex(x=>x.includes('bool operator() (TaskContainer const& left, TaskContainer const& right)'))

    if(index >= 0) {
        if(!TaskScheduler_h[index].match(/const *$/)) {
            TaskScheduler_h[index]+=' const'
            fs.writeFileSync(TASK_SCHEDULER_FILE,TaskScheduler_h.join('\n'))
        }
    }

    const G3D_SYSTEM_FILE = 'TrinityCore/dep/g3dlite/source/System.cpp'
    let G3D_System_cpp = fs.readFileSync(G3D_SYSTEM_FILE,'utf-8')
    if(!G3D_System_cpp.includes('<intrin.h>')) {
        G3D_System_cpp = '#include <intrin.h>\n' + G3D_System_cpp
        fs.writeFileSync(G3D_SYSTEM_FILE,G3D_System_cpp)
    }

    // ================================
    //
    // Find matching TDB
    //
    // ================================

    if(!fs.existsSync('./token.env')) {
        console.log('Error: No token set, create a personal access token for github and put it inside a file called "token.env" in this directory.')
        process.exit(-1)
    }

    const octokit = new Octokit({
        auth: fs.readFileSync('./token.env','utf-8')
    })

    let releases = []
    for(let i = 0;;i++) {
        let req = await octokit.request(`GET /repos/trinitycore/trinitycore/releases`, {
            page: i,
            per_page: 100
        })
        releases = releases.concat(req.data.filter(x=>x.tag_name.includes('335.')))
        if(req.data.length === 0) {
            break;
        }
    }

    let dateStr = ""
    util.doIn('TrinityCore', ()=> dateStr = child_process.execSync('git log -1 --format=%cd').toString())
    let date = new Date(dateStr);
    const release = releases
        .filter(x=>new Date(x.published_at) - date < 0)
        .sort((a,b)=>new Date(b.published_at) - new Date(a.published_at))[0]
    const tdbUrl = release.assets[0].browser_download_url

    // ================================
    //
    // Find matching boost version
    //
    // ================================
    let boostVersions = [
        { date: new Date('Feb 14 2022'), url: 'https://github.com/tswow/misc/releases/download/boost-1.74/boost_1_74_0.zip' },
        { date: new Date('Apr 30 2020'), url: 'https://github.com/tswow/misc/releases/download/boost-1.72/boost_1_72_0.zip' },
        { date: new Date('Jul 01 2019'), url: 'https://github.com/ihm-tswow/boost-builds/releases/download/boost/boost_1_66_0.zip' },
        { date: new Date('Dec 17 2017'), url: 'https://github.com/ihm-tswow/boost-builds/releases/download/boost/boost_1_63_0.zip' },
        { date: new Date('Feb 28 2017'), url: 'https://github.com/ihm-tswow/boost-builds/releases/download/boost/boost_1_61_0.zip' },
        { date: new Date('Dec 12 2016'), url: 'https://github.com/ihm-tswow/boost-builds/releases/download/boost/boost_1_60_0.zip' },
        { date: new Date('Jan 01 2000'), url: 'https://github.com/ihm-tswow/boost-builds/releases/download/boost/boost_1_59_0.zip' },
    ]
    const boostUrl = boostVersions
        .filter(x=>new Date(x.date) - date < 0)
        .sort((a,b)=>b.date - a.date)[0].url

    const opensslVersions = [
        { date: new Date('Sep 10 2021'), url: 'https://github.com/tswow/misc/releases/download/openssl-test-1/openssl.zip' },
        { date: new Date('Jan 01 2000'), url: 'https://github.com/ihm-tswow/boost-builds/releases/download/boost/openssl_1_0_1p.zip' },
    ]
    const opensslUrl = opensslVersions
        .filter(x=>new Date(x.date) - date < 0)
        .sort((a,b)=>b.date - a.date)[0].url

    await Promise.all([
        util.downloadFile(settings.MYSQL_URL,'build/mysql.zip'),
        util.downloadFile(boostUrl,'build/boost.zip'),
        util.downloadFile(opensslUrl,'build/openssl.zip'),
        util.downloadFile(tdbUrl, 'build/tdb.7z'),
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

    let tdb = path.resolve(util.findSub('build/tdb','TDB_full','.sql'))
    fs.copyFileSync(tdb,'install/tdb.sql')
    let mysql = path.resolve(util.findSub('install/mysql'))
    let openssl = path.resolve('build/openssl')

    let boost = path.resolve('build/boost');
    if(fs.readdirSync(boost).length == 1)  {
        boost = util.findSub(boost);
    }

    console.log(`Running CMake`)

    util.exec(`cmake 
        -S "${path.resolve('./TrinityCore')}"
        -B "${path.resolve('build/trinitycore')}"
        -DMYSQL_INCLUDE_DIR="${mysql}/include"
        -DMYSQL_LIBRARY="${mysql}/lib/libmysql.lib"
        -DOPENSSL_INCLUDE_DIR="${openssl}/include"
        -DOPENSSL_ROOT_DIR="${openssl}"
        -DBOOST_ROOT="${boost}"
    `,{env:{'BOOST_ROOT':`${boost}`,...process.env}})

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
build();