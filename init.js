var fs = require('fs')
var path = require('path')
var net = require('net')
var child = require('child_process')

var Projects = {}
var Condidats = {}
var NumTCP = 0
var Logging = {}
var TCPServer = false
var TCPPort = false
var LogHistory = []

function addLog(project, data, color) {
  var lines = data.split("\n")
  for(var i in lines) {
    var str = lines[i]
    if (color) {
      str = "\033[1;3"+color+"m"+str+"\033[0m"
    }
    if (project) {
      str = "\033[1;33m"+project+"\033[0m "+str
    }
    LogHistory.push(str)
    if (LogHistory.length > 40) {
      LogHistory.shift()
    }
    for(var i in Logging) {
      Logging[i].write(str+"\n")
    }
  }
}

function dataToLines(obj, callback) {
  var d = '';
  obj.on('data', function(data) {
    var part = data.toString().split("\n")
    while(part.length) {
      d += part.shift()
      if (part.length) {
        callback(d);
        d = ''
      }
    }
  })
}

function run(name, params) {
  Projects[name] = params
  var projectPath = path.resolve(__dirname, params.path)
  var process = child.fork(projectPath, [], {silent: true})
  Projects[name].log = []
  Projects[name].watching = {}
  dataToLines(process.stdout, function(line) {
    Projects[name].log.push(line)
    if (Projects[name].log.length > 40) {
      Projects[name].log.shift()
    }

    for(var i in Projects[name].watching) {
      var c = Projects[name].watching[i]
      c.write(line+"\n")
    }
  })
  Projects[name].process = process
}

function stop(name) {
  Projects[name].process.kill()
  delete Projects[name]
}

function updateConfig(configPath) {
  fs.readFile(configPath, function (err, data) {
    if (err) {
      addLog(false, '[error] config read error'+err.message, 1)
    }
    try {
      var confData = eval('({'+data.toString()+'})')
    } catch(e) {
      addLog(false, '[error] config syntax:'+e.message, 1)
    }
    Condidats = confData.projects
    for (var i in Condidats) {
      if (!Projects[i]) {
        addLog(i, 'started')
        run(i, Condidats[i])
      } else if (Projects[i].path != Condidats[i].path) {
        addLog(i, 'restarted')
        stop(i)
        run(i, Condidats[i])
      }
    }
    if (!TCPPort) {
      startTCP(confData.port)
    } else if (TCPPort != confData.port) {
      addLog(false, 'port changed. new port = '+confData.port, 2)
      stopTCP();
      startTCP(confData.port)
    }
  });

  var watchTimeout = false
  fs.watch(configPath, {persistent: true}, function (curr, prev) {
    if (!watchTimeout) {
      watchTimeout = setTimeout(function() {
        addLog(false, 'config changed', 2)
        updateConfig(configPath)
      }, 100)
    }
  });
}

function command(cmd, args, c, connectNum) {
  switch(cmd) {
    case 'list':
      for(var i in Projects) {
        c.write(i+"\n")
      }
      c.end()
      break
    case 'exit':
      c.end()
      break
    case 'log':
      for(var i in LogHistory) {
        c.write(LogHistory[i]+"\n")
      }
      Logging[connectNum] = c
      break
    case 'restart':
      var name = args.shift()
      if (Projects[name]) {
        addLog(name, 'restarted')
        stop(name)
        run(name, Condidats[name])
        c.write(name+" restarted\n")
      } else {
        c.write("no such project\n")
      }
      c.end()
      break
    default:
      if (Projects[cmd]) {
        var projectLog = Projects[cmd].log
        for(var i in projectLog) {
          c.write(projectLog[i]+"\n")
        }
        Projects[cmd].watching[connectNum] = c
      } else {
        c.write('unknown command '+cmd+"\n")
        c.end()
      }
      break
  }
}

function startTCP(port) {
  TCPPort = port;
  TCPServer = net.createServer(function(c) { //'connection' listener
    var connectNum = ++NumTCP
    c.on('end', function() {
      delete Logging[connectNum]
      for(var i in Projects) {
        delete Projects[i].watching[connectNum]
      }
    });
    dataToLines(c, function(line) {
      var args = line.trim().split(' ');
      var cmd = args.shift();
      command(cmd, args, c, connectNum)
    })
  });
  TCPServer.listen(port)
}

function stopTCP() {
  if (TCPServer) {
    TCPServer.close()
    TCPServer = false
  }
}

function onExit() {
  stopTCP()
  for(var i in Projects) {
    var process = Projects[i].process
    if (process) {
      process.kill()
    }
    delete Projects[i]
  }
}

process.on('exit', onExit);
process.on('SIGINT', function() {
  onExit()
  process.exit()
});
process.on('uncaughtException', function(opts, err) {
  if (err) {
    console.err(err)
  }
});

addLog(false, 'Manager started', 2)
updateConfig(path.resolve(__dirname, 'config.json'))
