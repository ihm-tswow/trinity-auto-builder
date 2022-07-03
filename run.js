const path = require('path')
const fs = require('fs')
const child_process = require('child_process')
const util = require('./util')
const settings = require('./settings')
const mysql = require('mysql2')


async function main() {
    if(!fs.existsSync('install')) {
        await require('./build_script').build();
    }

    let mysql_root = util.findSub('install/mysql')
    let mysqld_exe = path.join(mysql_root,'bin','mysqld.exe')
    let mysql_exe = path.resolve(path.join(mysql_root,'bin','mysql.exe'))

    let db = path.resolve('install/db')
    if(!fs.existsSync(db)) {
        util.exec(`
            "${mysqld_exe}"
            --initialize
            --log_syslog=0
            --datadir=${db}
        `)
    }

    let user = 'trinity'
    let pass = 'trinity'

    fs.writeFileSync('./mysql_startup.txt',`
    CREATE USER IF NOT EXISTS '${user}'@'localhost' IDENTIFIED BY '${pass}';
    GRANT ALL ON *.* TO '${user}'@'localhost';
    ALTER USER '${user}'@'localhost' IDENTIFIED BY '${pass}';
    `)

    child_process.spawn(mysqld_exe,[
        `--port=${settings.MYSQL_PORT}`,
        '--log_syslog=0',
        '--console',
        '--wait-timeout=2147483',
        `--init-file=${path.resolve('mysql_startup.txt')}`,
        `--datadir=${path.resolve('install/db')}`
    ],{stdio:'inherit'})

    // stupid hack
    await util.sleep(1500)

    // build dbc/maps/vmaps
    fs.readdirSync('install/trinitycore/').forEach(x=>{
        let file = path.join('install/trinitycore',x)
        if(file.endsWith('.exe') || file.endsWith('.dll')) {
            fs.copyFileSync(file,path.join(settings.WOW_PATH,x))
        }
    })

    const dbcPath = 'install/trinitycore/dbc'
    const mapPath = 'install/trinitycore/maps'
    const vmapPath = 'install/trinitycore/vmaps'
    const mmapPath = 'install/trinitycore/mmaps'

    if(!fs.existsSync(dbcPath) || !fs.existsSync(mapPath)) {
        console.log('Building maps')
        util.removeIfExists(path.join(settings.WOW_PATH,'maps'))
        util.removeIfExists(path.join(settings.WOW_PATH,'dbc'))
        util.doIn(settings.WOW_PATH,()=>util.exec('"mapextractor.exe"'));
        util.copyFolderRecursiveSync(path.join(settings.WOW_PATH,'dbc'),'install/trinitycore/dbc')
        util.copyFolderRecursiveSync(path.join(settings.WOW_PATH,'maps'),'install/trinitycore/maps')
    }

    if(!fs.existsSync(vmapPath) && settings.BUILD_VMAPS) {
        console.log('Building vmaps')
        util.removeIfExists(path.join(settings.WOW_PATH,'Buildings'))
        util.removeIfExists(path.join(settings.WOW_PATH,'vmaps'))
        util.doIn(settings.WOW_PATH,()=>util.exec('"vmap4extractor.exe"'));
        util.doIn(settings.WOW_PATH,()=>util.exec('"vmap4assembler.exe"'));
        util.copyFolderRecursiveSync(path.join(settings.WOW_PATH,'vmaps'),'install/trinitycore/vmaps')
    }

    if(!fs.existsSync(mmapPath) && settings.BUILD_MMAPS) {
        console.log('Building mmaps')
        util.removeIfExists(path.join(settings.WOW_PATH,'mmaps'))
        util.doIn(settings.WOW_PATH,()=>util.exec('"mmaps_generator.exe"'));
        util.copyFolderRecursiveSync(path.join(settings.WOW_PATH,'mmaps'),mmapPath)
    }

    fs.writeFileSync('./write.sql','CREATE DATABASE IF NOT EXISTS `world`; CREATE DATABASE IF NOT EXISTS `characters`; CREATE DATABASE IF NOT EXISTS `auth`')

    const connection = mysql.createConnection({
        host:'127.0.0.1',
        user:'trinity',
        password:'trinity',
        port:settings.MYSQL_PORT,
        database:'information_schema'
    })
    function query(query) {
        return new Promise((res,rej)=>{
            connection.query(query,(err,result)=>{
                if(err) {
                    rej(err);
                } else {
                    res(result);
                }
            })
        })
    }

    let hasWorld = (await query('SELECT * from information_schema.tables WHERE table_schema = "world" AND table_name = "creature_template"')).length > 0
    let hasCharacters = (await query('SELECT * from information_schema.tables WHERE table_schema = "characters"')).length > 0
    let hasAuth = (await query('SELECT * from information_schema.tables WHERE table_schema = "auth"')).length > 0

    function runQuery(db,file) {
        util.exec(`
            "${mysql_exe}"
            -u ${user}
            --default-character-set=utf8
            -p${pass}
            --port ${settings.MYSQL_PORT}
            ${db} < ${file}
        `)
        console.log(`Executed ${file}`)
    }
    runQuery('information_schema','./write.sql')
    try {
        if(!hasAuth) runQuery('auth','install/sql/base/auth_database.sql')
        if(!hasCharacters ) runQuery('auth','install/sql/base/characters_database.sql')
        if(!hasWorld ) runQuery('auth','install/tdb.sql')
    } catch(err){}

    util.doIn('install/trinitycore',()=>{
        child_process.spawn('authserver.exe',{stdio:'inherit'})
        let str = fs.readFileSync('worldserver.conf.dist','utf-8')

        str = str
            .replace('MySQLExecutable = ""',`MySQLExecutable = "${mysql_exe}"`)
            .replace('SourceDirectory  = ""',`SourceDirectory = "${path.resolve('..')}"`)

        if(!settings.BUILD_VMAPS) {
            str = str.replace(/vmap\.enableLOS *= *1/,'vmap.enableLOS = 0')
            str = str.replace(/vmap\.enableHeight *= *1/,'vmap.enableHeight = 0')
            str = str.replace(/vmap\.enableIndoorCheck *= *1/,'vmap.enableIndoorCheck = 0')
            str = str.replace(/vmap\.enablePathFinding *= *1/,'vmap.enablePathFinding = 0')
        }
        fs.writeFileSync('worldserver.conf',str)
        child_process.spawn('worldserver.exe',{stdio:'inherit'})
    })
    child_process.spawn(path.join(settings.WOW_PATH,'wow.exe'))
}
main();