export async function takeScreenshot(fileName: string) {
    try {
        let canvas = await toCanvas();
        canvas.toBlob((blob) => {
            if (blob) {
                let a = document.createElement('a');
                a.style.display = 'none';
                a.href = URL.createObjectURL(blob);
                a.download = fileName;
                a.click();
            }
        });
        canvas.remove();
    } catch (e) {
        console.error(e);
    }
}

const options = {
    video: {
        cursor: 'never',
        displaySurface: 'browser',
    },
};

function draw(video: HTMLVideoElement) {
    let canvas = document.createElement('canvas');
    video.width = canvas.width = video.videoWidth;
    video.height = canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);

    (video.srcObject as MediaStream).getTracks().forEach((track: any) => track.stop());
    video.srcObject = null;

    return canvas;
}

async function toCanvas(): Promise<HTMLCanvasElement> {
    let stream = await navigator.mediaDevices.getDisplayMedia(options);
    let video = document.createElement('video');
    video.srcObject = stream;
    video.play();

    return new Promise((resolve) => {
        video.addEventListener(
            'canplay',
            (e) => {
                let canvas = draw(video);
                resolve(canvas);
            },
            { once: true }
        );
    });
}

async function toDataURL(...args: any[]) {
    let canvas = await toCanvas();
    return canvas.toDataURL(...args);
}

async function toBlob(...args: any[]) {
    let canvas = await toCanvas();
    return new Promise((resolve) => canvas.toBlob(resolve, ...args));
}
