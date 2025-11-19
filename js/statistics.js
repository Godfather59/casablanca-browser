const settings = require('util/settings/settings.js')

const statistics = {
  envGetters: [],
  registerGetter: function (key, fn) {
    statistics.envGetters.push({ key, fn })
  },
  usageDataCache: {},
  getValue: function (key) {
    return statistics.usageDataCache[key]
  },
  setValue: function (key, value) {
    statistics.usageDataCache[key] = value
  },
  incrementValue: function (key, value) {
    if (statistics.usageDataCache[key]) {
      statistics.usageDataCache[key]++
    } else {
      statistics.usageDataCache[key] = 1
    }
  },
  upload: function () {
    // Usage statistics upload is disabled in this build.
    return
  },
  initialize: function () {
    // Ensure stats are disabled and no timers or
    // background network requests are created.
    settings.set('collectUsageStats', false)
    settings.set('usageData', null)
    settings.set('clientID', undefined)
  }
}

module.exports = statistics
