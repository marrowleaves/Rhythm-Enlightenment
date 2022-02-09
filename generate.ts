import fs from 'fs'
import path from 'path'

import R from 'ramda'
import { pinyin, customPinyin } from 'pinyin-pro'

// FILES
const RAW_FILE = path.resolve(__dirname, 'raw_text.txt')
const CUSTOM_PINYIN_FILE = path.resolve(__dirname, 'custom_pinyin.json')
const HTML_TEMPLATE_FILE = path.resolve(__dirname, 'index.template.html')
const HTML_OUTPUT = path.resolve(__dirname, 'index.html')

customPinyin(require(CUSTOM_PINYIN_FILE))

// MARKS
const CONTENT_PLACEHOLDER = '__CONTENT__'
// 2 volumes
// 15 parts per volume
// 4 lines per part
// 1 line for title
// 3 lines for paragraphs
const VOLUME_DELIM = '---'
const NEWLINE = '\n'
const LINES_PER_PART = 4

// OTHER CONSTANTS
const REG_BREAKABLE = /[。；]/
const REG_PUNCTUATION = /[，。；]/g
const MAX_LINE_WIDTH = 16

//=== HELPERS
const surround = (pre: string, post: string, str: string) =>
  `${pre}${str}${post}`

const tag = R.curry((tag: string, str: string) =>
  surround(`<${tag}>`, `</${tag}>`, str),
)

const tagWithClass = R.curry((tag: string, className: string, str: string) =>
  surround(`<${tag} class="${className}">`, `</${tag}>`, str),
)

// bind for the string(list) monad
const bind = <T extends unknown>(fn: (v: T) => string, list: T[]) =>
  R.join('', R.map(fn, list))

const addPinyin = (str: string) =>
  tag(
    'ruby',
    bind<R.KeyValuePair<string, string>>(
      ([ch, py]) =>
        R.join('', [ch, tag('rp', '('), tag('rt', py), tag('rp', ')')]),
      R.zip(str.split(''), pinyin(str, { type: 'array' })),
    ),
  )

const addLineWithPinyin = (str: string) =>
  str.replace(/[^，。；]+?(?=[，。；])/g, addPinyin)

// break str within max length
const br = (str: string, maxLen: number) => {
  const breakIndice = [0]
  let prev = R.last(breakIndice)!
  let potentialI = str.search(REG_BREAKABLE)
  let i
  while (potentialI >= 0) {
    i = prev + potentialI + 1
    const len = i - R.last(breakIndice)!
    if (len > maxLen) {
      if (prev === R.last(breakIndice)) {
        breakIndice.push(i)
      } else {
        breakIndice.push(prev)
      }
    }
    prev = i
    potentialI = str.substring(prev).search(REG_BREAKABLE)
  }
  breakIndice.push(str.length)

  return breakIndice
    .slice(1, breakIndice.length)
    .map((cur, i) => str.substring(breakIndice[i], cur))
}

const addBrAndPinyin = (str: string) =>
  bind(
    R.compose(tagWithClass('span', 'line'), addLineWithPinyin),
    br(str, MAX_LINE_WIDTH),
  )

//--- HELPERS

// MAIN
interface Part {
  title: string
  paragraphs: string[]
}
const toVolumes = R.pipe(R.trim, R.split(VOLUME_DELIM))
const toParts = R.pipe(
  R.trim,
  R.split(NEWLINE),
  R.splitEvery(LINES_PER_PART) as (list: readonly string[]) => string[][],
  R.map(
    ([title, ...paragraphs]) =>
      ({
        title,
        paragraphs,
      } as Part),
  ),
)
const data = R.pipe(
  toVolumes,
  R.map(toParts),
  R.flatten,
)(fs.readFileSync(RAW_FILE, { encoding: 'utf-8' }))

const doTitle = R.pipe(addPinyin, tag('h3'))
const doParagraph = R.pipe(addBrAndPinyin, tag('section'))
const doPart = (part: Part) =>
  tag(
    'article',
    R.join('', [doTitle(part.title), ...R.map(doParagraph, part.paragraphs)]),
  )
const markPunctuation = tagWithClass('span', 'punctuation')
const content = tag(
  'main',
  R.replace(REG_PUNCTUATION, markPunctuation, bind(doPart, data)),
)

const template = fs.readFileSync(HTML_TEMPLATE_FILE, { encoding: 'utf-8' })

const htmlContent = template.replace(CONTENT_PLACEHOLDER, content)

fs.writeFileSync(HTML_OUTPUT, htmlContent)

console.log('done')
