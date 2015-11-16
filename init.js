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

function color(str, color) {
  return "\033[1;3"+color+"m"+str+"\033[0m"
}

function projectLog(name, line) {
  if (!Projects[name]) {
    return;
  }
  Projects[name].log.push(line)
  if (Projects[name].log.length > 40) {
    Projects[name].log.shift()
  }

  for(var i in Projects[name].watching) {
    var c = Projects[name].watching[i]
    c.write(line+"\n")
  }
}

function globalLog(project, data) {
  var lines = data.split("\n")
  for(var i in lines) {
    var str = lines[i]
    if (project) {
      str = color(project+' ', 3)+str
    }
    LogHistory.push(str)
    if (LogHistory.length > 40) {
      LogHistory.shift()
    }
    for(var i in Logging) {
      Logging[i].write(str+"\n")
    }
    if (project) {
      projectLog(project, str)
    }
  }
}

function dataToLines(obj, callback) {
  var d = ''
  obj.on('data', function(data) {
    var part = data.toString().split("\n")
    while(part.length) {
      d += part.shift()
      if (part.length) {
        callback(d)
        d = ''
      }
    }
  })
}

function run(name, params) {
  if (!Projects[name]) {
    Projects[name] = {log: [], watching: {}}
  }
  for(var i in params) {
    Projects[name][i] = params[i]
  }
  Projects[name].stopped = 0;
  var projectPath = path.resolve(__dirname, params.path)
  var process = child.fork(projectPath, [], {silent: true})
  dataToLines(process.stdout, function(line) {
    projectLog(name, line)
  })
  process.on('exit', function(code) {
    if (!Condidats[name]) {
      return
    }
    delay = Projects[name].delay || 0;
    if (new Date().getTime() - Projects[name].delayTs > 3000) {
      delay = 0;
    }
    setTimeout(function() {
      run(name, Condidats[name])
      Projects[name].delayTs = new Date().getTime()
    }, delay * 1000)
    globalLog(name, 'died, restart'+(delay ? ' in '+delay+' sec' : ''))
    if (delay < 60) {
      Projects[name].delay = delay + 1
    }
  })
  Projects[name].process = process
}

function stop(name) {
  Projects[name].delayTs = new Date().getTime
  Projects[name].process.kill()
  Projects[name].stopped = 1;
  delete Projects[name].process
}

function updateConfig(configPath) {
  fs.readFile(configPath, function (err, data) {
    if (err) {
      globalLog(false, '[error] config read error'+err.message, 1)
    }
    try {
      var confData = eval('({'+data.toString()+'})')
    } catch(e) {
      globalLog(false, '[error] config syntax:'+e.message, 1)
    }
    Condidats = confData.projects
    for (var i in Condidats) {
      if (!Projects[i] || Projects[i].stopped) {
        run(i, Condidats[i])
        globalLog(i, 'started')
      } else if (Projects[i].path != Condidats[i].path) {
        stop(i)
        globalLog(i, 'restarted')
      }
    }
    for(var i in Projects) {
      if (!Condidats[i]) {
        stop(i)
        globalLog(i, 'stopped')
      }
    }
    if (!TCPPort) {
      startTCP(confData.port)
    } else if (TCPPort != confData.port) {
      globalLog(false, 'port changed. new port = '+confData.port, 2)
      stopTCP();
      startTCP(confData.port)
    }
  });

  var watchTimeout = false
  fs.watch(configPath, {persistent: true}, function (curr, prev) {
    if (!watchTimeout) {
      watchTimeout = setTimeout(function() {
        globalLog(false, 'config changed', 2)
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
        globalLog(name, 'restarted')
        stop(name)
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
      for(var i in Condidats) {
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
process.on('uncaughtException', function(err) {
  console.log(err.stack);
  try {
    globalLog(false, err.stack);
  } catch(e) {}
});

globalLog(false, color('Manager started', 2))
updateConfig(path.resolve(__dirname, 'config.json'))
