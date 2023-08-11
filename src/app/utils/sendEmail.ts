export function sendEmail(recipient: string, subject: string, message: string) {
    const link = document.createElement('a');
    link.href = `mailto:${recipient}?subject=${subject}&body=${encodeURIComponent(message)}`;

    link.target = '_blank';
    link.click();
}
