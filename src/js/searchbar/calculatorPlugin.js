/*
  This plugin provides a simple calculator in the searchbar
  using a small, local expression evaluator (no external deps).
*/

const { clipboard } = require('electron')
const searchbarPlugins = require('searchbar/searchbarPlugins.js')

// Allow only basic math characters to keep evaluation safe.
// We intentionally disallow letters and other punctuation so
// the expression can't reference global objects or functions.
const allowedCharsRegex = /^[0-9+\-*/%^().,\s]+$/

function evaluateExpression (text) {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }

  if (!allowedCharsRegex.test(trimmed)) {
    return null
  }

  // Use JS exponent operator instead of ^
  const jsExpr = trimmed.replace(/\^/g, '**')

  let result
  try {
    // eslint-disable-next-line no-new-func
    result = Function('"use strict"; return (' + jsExpr + ')')()
  } catch (e) {
    return null
  }

  if (typeof result !== 'number' || !isFinite(result)) {
    return null
  }

  return result.toString()
}

function doMath (text, input, inputFlags) {
  searchbarPlugins.reset('calculatorPlugin')

  const result = evaluateExpression(text)
  if (!result) {
    return
  }

  searchbarPlugins.addResult('calculatorPlugin', {
    icon: 'carbon:calculator',
    title: result,
    descriptionBlock: l('clickToCopy')
  })

  const container = searchbarPlugins.getContainer('calculatorPlugin')

  if (container.childNodes.length === 1) {
    const item = container.childNodes[0]
    item.addEventListener('click', (e) => {
      const titleEl = item.querySelector('.title')
      const descriptionBlockEl = item.querySelector('.description-block')

      clipboard.writeText(titleEl.innerText)
      descriptionBlockEl.innerText = `${l('copied')}!`
    })
  }
}

function initialize () {
  searchbarPlugins.register('calculatorPlugin', {
    index: 1,
    trigger: function (text) {
      if (text.length < 3 || text.length > 100) {
        return false
      }

      return evaluateExpression(text) !== null
    },
    showResults: debounce(doMath, 200)
  })
}

module.exports = { initialize }
