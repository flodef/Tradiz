export function sendEmail(subject: string, message: string) {
    const link = document.createElement('a');
    link.href = 'mailto:?subject=' + subject + '&body=' + encodeURIComponent(message);

    link.target = '_blank';
    link.click();
}
