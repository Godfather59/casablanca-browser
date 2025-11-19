var regedit = require('regedit')

var installPath = process.execPath

var keysToCreate = [
  'HKCU\\Software\\Classes\\Casablanca',
  'HKCU\\Software\\Classes\\Casablanca\\Application',
  'HKCU\\Software\\Classes\\Casablanca\\DefaulIcon',
  'HKCU\\Software\\Classes\\Casablanca\\shell\\open\\command',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Casablanca\\Capabilities\\FileAssociations',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Casablanca\\Capabilities\\StartMenu',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Casablanca\\Capabilities\\URLAssociations',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Casablanca\\DefaultIcon',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Casablanca\\InstallInfo',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Casablanca\\shell\\open\\command'
]

var registryConfig = {
  'HKCU\\Software\\RegisteredApplications': {
    Casablanca: {
      value: 'Software\\Clients\\StartMenuInternet\\Casablanca\\Capabilities',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\Casablanca': {
    default: {
      value: 'Casablanca Browser Document',
      type: 'REG_DEFAULT'
    }
  },
  'HKCU\\Software\\Classes\\Casablanca\\Application': {
    ApplicationIcon: {
      value: installPath + ',0',
      type: 'REG_SZ'
    },
    ApplicationName: {
      value: 'Casablanca',
      type: 'REG_SZ'
    },
    AppUserModelId: {
      value: 'Casablanca',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\Casablanca\\DefaulIcon': {
    ApplicationIcon: {
      value: installPath + ',0',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\Casablanca\\shell\\open\\command': {
    default: {
      value: '"' + installPath + '" "%1"',
      type: 'REG_DEFAULT'
    }
  },
  'HKCU\\Software\\Classes\\.htm\\OpenWithProgIds': {
    Casablanca: {
      value: 'Empty',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\.html\\OpenWithProgIds': {
    Casablanca: {
      value: 'Empty',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Casablanca\\Capabilities\\FileAssociations': {
    '.htm': {
      value: 'Casablanca',
      type: 'REG_SZ'
    },
    '.html': {
      value: 'Casablanca',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Casablanca\\Capabilities\\StartMenu': {
    StartMenuInternet: {
      value: 'Casablanca',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Casablanca\\Capabilities\\URLAssociations': {
    http: {
      value: 'Casablanca',
      type: 'REG_SZ'
    },
    https: {
      value: 'Casablanca',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Casablanca\\DefaultIcon': {
    default: {
      value: installPath + ',0',
      type: 'REG_DEFAULT'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Casablanca\\InstallInfo': {
    IconsVisible: {
      value: 1,
      type: 'REG_DWORD'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Casablanca\\shell\\open\\command': {
    default: {
      value: installPath,
      type: 'REG_DEFAULT'
    }
  }
}

var registryInstaller = {
  install: function () {
    return new Promise(function (resolve, reject) {
      regedit.createKey(keysToCreate, function (err) {
        regedit.putValue(registryConfig, function (err) {
          if (err) {
            reject()
          } else {
            resolve()
          }
        })
      })
    })
  },
  uninstall: function () {
    return new Promise(function (resolve, reject) {
      regedit.deleteKey(keysToCreate, function (err) {
        if (err) {
          reject()
        } else {
          resolve()
        }
      })
    })
  }
}
