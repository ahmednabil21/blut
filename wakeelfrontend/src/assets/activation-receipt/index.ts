/** صور وصل التفعيل — تُستورد عبر Webpack لضمان مسار صحيح تحت `/wakeel/static/...` */
import activationInvoiceLogo from './activation-invoice-logo.png';
import activationReceiptQr from './QR.png';

export const ACTIVATION_RECEIPT_BUNDLED_ASSETS = {
  logo: activationInvoiceLogo,
  qr: activationReceiptQr,
} as const;
