MANAGER
=======

Manager is a daemon control tool for Node.js projects

### Installation (Linux only)
```
git clone git@github.com:brainfucker/manager.git
cd manager
sudo make install
```

### Usage
* **manager log** - get the manager log
* **manager list** - list all projects
* **manager project_name** - get stdout of the selected project
* **manager restart project_name** - restart a project

Manager will be launched as a daemon from a directory it is installed to, and will start at the system startup.

Edit config.json to add or remove projects, manager will automaticly update settings after config.json is saved.

### Config format
```
projects: {
  my_project: { // name of project
    path './node_project.js' // node project path
  }
},

port: 8169 // port the daemon will use to communicate with client
```

You can restart the manager daemon using
```
restart manager
```
but during normal usage this would never be needed
