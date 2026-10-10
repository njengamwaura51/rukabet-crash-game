const fs = require('fs');
const file = '/tmp/rukabet_repo/src/components/AuthModal.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const SAFARICOM_REGEX = \/\^\(7\[01245679\]\\d\{7\}\|11\[0-5\]\\d\{6\}\)\$\//,
  'const SAFARICOM_REGEX = /^0(7[01245679]\\d{7}|11[0-5]\\d{6})$/'
);

content = content.replace(
  /function normalizePhoneInput[\s\S]*?return cleaned\.slice\(0, 9\)\n}/,
  `function normalizePhoneInput(phone: string): string {
  let cleaned = phone.replace(/\\D/g, '')
  if (cleaned.startsWith('254')) {
    cleaned = '0' + cleaned.slice(3)
  }
  if (cleaned.length > 0 && !cleaned.startsWith('0')) {
    cleaned = '0' + cleaned
  }
  return cleaned.slice(0, 10)
}`
);

content = content.replace(
  /const isComplete = normalized\.length === 9/,
  'const isComplete = normalized.length === 10'
);

content = content.replace(
  /setError\('Enter your 9-digit phone number'\)/g,
  "setError('Enter your 10-digit phone number')"
);

content = content.replace(
  /maxLength=\{9\}/g,
  'maxLength={10}'
);

content = content.replace(
  /placeholder="712345678"/g,
  'placeholder="0712345678"'
);

fs.writeFileSync(file, content);
