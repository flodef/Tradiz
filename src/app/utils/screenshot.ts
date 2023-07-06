import html2canvas from 'html2canvas';

export function takeScreenshot(elementId: string, fileName: string) {
    const element = document.getElementById(elementId);
    if (element) {
        html2canvas(element).then((canvas) => {
            console.log(canvas);
            canvas.toBlob((blob) => {
                if (blob) {
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = fileName;
                    a.click();
                }
            });
            canvas.remove();
        });
    } else {
        console.error('Element not found: ' + elementId);
    }
}
