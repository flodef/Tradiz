// inspired by codepen.io/42EG4M1/pen/bVMzze/
export default function Loading() {
    // You can add any UI inside Loading, including a Skeleton.

    const phrase = 'CHARGEMENT'.split('');
    const classNames = phrase.map((_, i) => 'inline-block my-0 mx-1 blur-0 animate-loading' + i);

    return (
        <div
            className="absolute top-0 bottom-0 left-0 right-0 m-auto text-center w-full h-full flex items-center justify-center font-semibold text-2xl"
            style={{ background: 'inherit' }}
        >
            {phrase.map((item, i) => (
                <span key={i} className={classNames[i]}>
                    {item}
                </span>
            ))}
            {/* <span class="inline-block my-0 mx-1 blur-0 animate-loading0">C</span>
            <span class="inline-block my-0 mx-1 blur-0 animate-loading1">H</span>
            <span class="inline-block my-0 mx-1 blur-0 animate-loading2">A</span>
            <span class="inline-block my-0 mx-1 blur-0 animate-loading3">R</span>
            <span class="inline-block my-0 mx-1 blur-0 animate-loading4">G</span>
            <span class="inline-block my-0 mx-1 blur-0 animate-loading5">E</span>
            <span class="inline-block my-0 mx-1 blur-0 animate-loading6">M</span>
            <span class="inline-block my-0 mx-1 blur-0 animate-loading7">E</span>
            <span class="inline-block my-0 mx-1 blur-0 animate-loading8">N</span>
            <span class="inline-block my-0 mx-1 blur-0 animate-loading9">T</span> */}
        </div>
    );
}
