/** Naver Search Advisor issues a separate public ownership token for each site. */
const TOKENS = Object.freeze({
  'https://boothana.kr': '544361e5b621171d74f4dd8afb0407680ef5e91c',
  'https://subculture.boothana.kr': 'b617596a2b5dffaa334a642ae97b566b3d13f3c3',
  'https://expo.boothana.kr': 'aa1b45aeba7556b8864f406811ae917deccf2964',
  'https://festival.boothana.kr': '508f57cefd3516e935cb6f7d358746fcbe60c47d',
})

export function naverVerificationFor(origin) {
  return Object.hasOwn(TOKENS, origin) ? TOKENS[origin] : ''
}
