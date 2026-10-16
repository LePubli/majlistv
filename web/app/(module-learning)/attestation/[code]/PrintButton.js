'use client';
export default function PrintButton({ label }) {
  return <button type="button" className="btn attest-print" onClick={() => window.print()}>{label}</button>;
}
