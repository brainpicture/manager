var fs = require('fs')

var serviceConf = `\
description "manager daemon"
author "Oleg Illarionov"
start on started mountall
stop on shutdown
respawn
respawn limit 99 5
script
  export HOME="/root"
  exec /usr/local/bin/node `+__dirname+`/init.js >> /dev/null 2>&1
end script
post-start script
end script`

var cliCode = `\
#!/bin/sh
/usr/local/bin/node `+__dirname+`/cli.js $@
`
try {
  fs.writeFileSync('/etc/init/manager.conf', serviceConf)
  console.log('[Daemon setup success]')

  fs.writeFileSync('/usr/bin/manager', cliCode)
  fs.chmodSync('/usr/bin/manager', 0755)
  console.log('[Client setup success]')
} catch(e) {
  console.log(e.message)
  if (e.errno == -13) {
    console.log('please, use sudo')
  }
}
