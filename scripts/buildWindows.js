const fs = require('fs')
const builder = require('electron-builder')
const Arch = builder.Arch

const packageFile = require('./../package.json')
const version = packageFile.version

const createPackage = require('./createPackage.js')

async function afterPackageBuilt (packagePath) {
  /* create output directory if it doesn't exist */
  if (!fs.existsSync('dist/app')) {
    fs.mkdirSync('dist/app')
  }

  // createPackage (scripts/createPackage.js) already builds a normal unpacked app
  // at dist/app/win-unpacked with asar disabled. No external installer or zip.
  // Just log the location so it is easy to find.
  console.log('Windows unpacked build created at:', packagePath)
}

// Build only a single Windows x64 installer (.exe)
createPackage('win32', { arch: Arch.x64 })
  .then(afterPackageBuilt)
