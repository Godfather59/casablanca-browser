/* imports common modules */

var electron = require('electron')
var ipc = electron.ipcRenderer

var propertiesToClone = ['deltaX', 'deltaY', 'metaKey', 'ctrlKey', 'defaultPrevented', 'clientX', 'clientY']

var fingerprintRandomizationEnabled = true

try {
  // this value is passed from the main process in additionalArguments
  var launchArgs = process.argv.filter(function (arg) {
    return arg.indexOf('--fingerprint-randomization=') === 0
  })
  if (launchArgs[0]) {
    var value = launchArgs[0].split('=')[1]
    fingerprintRandomizationEnabled = (value !== 'false')
  }
} catch (e) {}

function cloneEvent (e) {
  var obj = {}

  for (var i = 0; i < propertiesToClone.length; i++) {
    obj[propertiesToClone[i]] = e[propertiesToClone[i]]
  }
  return JSON.stringify(obj)
}

function defineReadOnlyProperty (target, key, value) {
  try {
    Object.defineProperty(target, key, {
      configurable: false,
      enumerable: true,
      get: function () {
        return value
      }
    })
  } catch (e) {}
}

function roundToStep (value, step) {
  return Math.round(value / step) * step
}

function setupFingerprintRandomization () {
  if (!fingerprintRandomizationEnabled) {
    return
  }

  // choose a per-session random seed so values are stable during one run
  var sessionSeed = Math.random()

  // Random but plausible navigator values
  var hardwareConcurrencyOptions = [2, 4, 8]
  var deviceMemoryOptions = [4, 8, 16]

  var randomizedHardwareConcurrency = hardwareConcurrencyOptions[Math.floor(sessionSeed * hardwareConcurrencyOptions.length)]
  var randomizedDeviceMemory = deviceMemoryOptions[Math.floor(sessionSeed * deviceMemoryOptions.length)]

  try {
    defineReadOnlyProperty(navigator, 'hardwareConcurrency', randomizedHardwareConcurrency)
  } catch (e) {}

  try {
    if ('deviceMemory' in navigator) {
      defineReadOnlyProperty(navigator, 'deviceMemory', randomizedDeviceMemory)
    }
  } catch (e) {}

  // Normalize navigator.languages / language to a generic value to avoid locale leaks
  try {
    defineReadOnlyProperty(navigator, 'language', 'en-US')
    defineReadOnlyProperty(navigator, 'languages', ['en-US', 'en'])
  } catch (e) {}

  // Timezone: random but plausible time zone and offset
  try {
    var timeZones = ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo']
    var timeZoneOffsets = {
      UTC: 0,
      'Europe/Berlin': -60,
      'America/New_York': 300,
      'Asia/Tokyo': -540
    }

    var tzIndex = Math.floor(sessionSeed * timeZones.length)
    var randomizedTimeZone = timeZones[tzIndex]
    var randomizedOffset = timeZoneOffsets[randomizedTimeZone]

    if (typeof Date !== 'undefined' && Date.prototype && Date.prototype.getTimezoneOffset) {
      Date.prototype.getTimezoneOffset = function () {
        return randomizedOffset
      }
    }

    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat && Intl.DateTimeFormat.prototype && Intl.DateTimeFormat.prototype.resolvedOptions) {
      var originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions
      Intl.DateTimeFormat.prototype.resolvedOptions = function () {
        var options = originalResolvedOptions.call(this)
        options.timeZone = randomizedTimeZone
        return options
      }
    }
  } catch (e) {}

  // Slightly perturb canvas pixel data to change canvas fingerprint hashes.
  // This should be visually indistinguishable but makes the hash unstable.

  try {
    var originalGetImageData = CanvasRenderingContext2D.prototype.getImageData
    CanvasRenderingContext2D.prototype.getImageData = function () {
      var imageData = originalGetImageData.apply(this, arguments)

      var data = imageData.data
      // apply very small noise to a subset of pixels
      for (var i = 0; i < data.length; i += 4 * 100) {
        // tweak RGB by +/-1
        var delta = (Math.random() > 0.5 ? 1 : -1)
        data[i] = Math.min(255, Math.max(0, data[i] + delta))
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + delta))
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + delta))
      }

      return imageData
    }
  } catch (e) {}

  // Normalize reported screen size to reduce entropy while keeping real layout
  try {
    var normalizedWidth = roundToStep(window.screen.width, 100)
    var normalizedHeight = roundToStep(window.screen.height, 100)

    defineReadOnlyProperty(window.screen, 'availWidth', normalizedWidth)
    defineReadOnlyProperty(window.screen, 'availHeight', normalizedHeight)
  } catch (e) {}

  // WebGL: hide detailed renderer info and add slight noise to readPixels
  try {
    function patchWebGLContext (contextConstructor) {
      if (!contextConstructor || !contextConstructor.prototype) {
        return
      }

      var glProto = contextConstructor.prototype

      if (glProto.__fingerprintPatched) {
        return
      }
      glProto.__fingerprintPatched = true

      var originalGetParameter = glProto.getParameter
      if (originalGetParameter) {
        glProto.getParameter = function (pname) {
          try {
            if (pname === contextConstructor.VENDOR) {
              return 'WebKit'
            }
            if (pname === contextConstructor.RENDERER) {
              return 'WebKit WebGL'
            }
          } catch (e) {}
          return originalGetParameter.apply(this, arguments)
        }
      }

      var originalGetExtension = glProto.getExtension
      if (originalGetExtension) {
        glProto.getExtension = function (name) {
          if (name === 'WEBGL_debug_renderer_info') {
            return null
          }
          return originalGetExtension.apply(this, arguments)
        }
      }

      var originalReadPixels = glProto.readPixels
      if (originalReadPixels) {
        glProto.readPixels = function (x, y, width, height, format, type, pixels) {
          var result = originalReadPixels.apply(this, arguments)
          try {
            if (pixels && pixels.length) {
              for (var i = 0; i < pixels.length; i += 4 * 100) {
                pixels[i] = pixels[i] ^ 1
              }
            }
          } catch (e) {}
          return result
        }
      }
    }

    if (typeof WebGLRenderingContext !== 'undefined') {
      patchWebGLContext(WebGLRenderingContext)
    }
    if (typeof WebGL2RenderingContext !== 'undefined') {
      patchWebGLContext(WebGL2RenderingContext)
    }
  } catch (e) {}

  // Audio fingerprint: add small noise to AudioBuffer channel data
  try {
    if (typeof AudioBuffer !== 'undefined' && AudioBuffer.prototype && AudioBuffer.prototype.getChannelData) {
      var originalGetChannelData = AudioBuffer.prototype.getChannelData
      AudioBuffer.prototype.getChannelData = function () {
        var data = originalGetChannelData.apply(this, arguments)
        try {
          if (data && data.length) {
            for (var i = 0; i < data.length; i += 100) {
              var delta = (Math.random() - 0.5) * 1e-7
              data[i] += delta
            }
          }
        } catch (e) {}
        return data
      }
    }
  } catch (e) {}

  // Plugins and mime types: normalize to an empty list
  try {
    var emptyPlugins = []
    emptyPlugins.length = 0
    emptyPlugins.item = function () { return undefined }
    emptyPlugins.namedItem = function () { return undefined }

    var emptyMimeTypes = []
    emptyMimeTypes.length = 0
    emptyMimeTypes.item = function () { return undefined }
    emptyMimeTypes.namedItem = function () { return undefined }

    defineReadOnlyProperty(navigator, 'plugins', emptyPlugins)
    defineReadOnlyProperty(navigator, 'mimeTypes', emptyMimeTypes)
  } catch (e) {}
}

// apply fingerprint randomization as early as possible
setupFingerprintRandomization()

// workaround for Electron bug
setTimeout(function () {

  /* Used for swipe gestures */
  window.addEventListener('wheel', function (e) {
    ipc.send('wheel-event', cloneEvent(e))
  })

  var scrollTimeout = null

  window.addEventListener('scroll', function () {
    clearTimeout(scrollTimeout)
    scrollTimeout = setTimeout(function () {
      ipc.send('scroll-position-change', Math.round(window.scrollY))
    }, 200)
  })
}, 0)

/* Used for picture in picture item in context menu */
ipc.on('getContextMenuData', function (event, data) {
  // check for video element to show picture-in-picture menu
  var hasVideo = Array.from(document.elementsFromPoint(data.x, data.y)).some(el => el.tagName === 'VIDEO')
  ipc.send('contextMenuData', { hasVideo })
})

ipc.on('enterPictureInPicture', function (event, data) {
  var videos = Array.from(document.elementsFromPoint(data.x, data.y)).filter(el => el.tagName === 'VIDEO')
  if (videos[0]) {
    videos[0].requestPictureInPicture()
  }
})

window.addEventListener('message', function (e) {
  if (!e.origin.startsWith('min://')) {
    return
  }

  if (e.data?.message === 'showCredentialList') {
    ipc.send('showCredentialList')
  }

  if (e.data?.message === 'showUserscriptDirectory') {
    ipc.send('showUserscriptDirectory')
  }

  if (e.data?.message === 'downloadFile') {
    ipc.send('downloadFile', e.data.url)
  }
})
