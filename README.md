MANAGER
=======

Manager is daemon control tool for Node.js projects

### Installation (Linux only)
```
git clone git@github.com:brainfucker/manager.git
cd manager
sudo make install
```

### Usage
* **manager log** - get manager log
* **manager list** - list all projects
* **manager project_name** - get stdout of selected project
* **manager restart project_name** - restart project

Manager will be launched as daemon from the directory, you install it from, and will start with system startup

Edit config.json to add or remove projects, manager will automaticly update settings after config.json will be saved

### Config format
```
projects: {
  my_project: { // name of project
    path './node_project.js' // node project path
  }
},

port: 8169 // port, daemon will use for communication with client
```

You can restart manager daemon using
```
restart manager
```
but with normal usage it never would be neaded
