/** Device identity only: a narrow desktop window or touchscreen laptop still plays. */
export function isPhoneOrTablet(device) {
  const userAgent=device.userAgent||'';
  return device.userAgentData?.mobile===true||/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(userAgent)||
    ((device.platform==='MacIntel'||/Macintosh/.test(userAgent))&&device.maxTouchPoints>1);
}
