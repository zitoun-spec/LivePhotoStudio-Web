export function time(seconds: number, fraction = false) {
  const total = Math.floor(Math.max(0, seconds) * 10 + 1e-6)
  const whole = Math.floor(total / 10)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const remainder = String(whole % 60).padStart(2, '0')
  const prefix = hours ? hours + ':' + String(minutes).padStart(2, '0') : String(minutes)
  const tenth = total % 10
  return prefix + ':' + remainder + (fraction ? '.' + tenth : '')
}

export function size(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB'
  return (bytes / 1024 ** 3).toFixed(2) + ' GB'
}

export function aspectRatio(width: number, height: number) {
  let a = Math.round(width)
  let b = Math.round(height)
  while (b > 0) [a, b] = [b, a % b]
  const left = Math.round(width) / a
  const right = Math.round(height) / a
  return left <= 32 && right <= 32 ? left + ':' + right : (width / height).toFixed(2) + ':1'
}
