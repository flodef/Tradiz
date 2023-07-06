import html2canvas from 'html2canvas';

export async function takeScreenshot(elementId: string, fileName: string) {
    const element = document.getElementById(elementId);
    if (element) {
        const canvas = await html2canvas(element);

        canvas.toBlob((blob) => {
            if (blob) {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = fileName;
                a.click();
            }
        });
        canvas.remove();
    } else {
        console.error('Element not found: ' + elementId);
    }
}
