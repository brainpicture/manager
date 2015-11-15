#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
var net = require('net')

var data = fs.readFileSync(path.resolve(__dirname, 'config.json'));
var confData = eval('({'+data.toString()+'})')

var args = process.argv.slice(2)
if (!args.length) {
  args = ['list']
}

function parseData(d) {
  console.log(d);
}

var client = net.connect({port: confData.port}, function() {
  client.write(args.join(' ')+"\n");
  var d = '';
  client.on('data', function(data) {
    var part = data.toString().split("\n")
    while(part.length) {
      d += part.shift()
      if (part.length) {
        parseData(d)
        d = ''
      }
    }
  });
});

client.on('error', function(e) {
  if (e.code == 'ECONNREFUSED') {
    console.log('[error] manager not started');
  } else {
    console.log(e.message);
  }
})
