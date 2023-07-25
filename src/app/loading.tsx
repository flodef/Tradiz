// inspired by codepen.io/42EG4M1/pen/bVMzze/
export default function Loading() {
    // You can add any UI inside Loading, including a Skeleton.
    return (
        <div
            className="absolute top-0 bottom-0 left-0 right-0 m-auto text-center w-full h-full flex items-center justify-center font-semibold text-2xl"
            style={{ background: 'inherit' }}
        >
            {'CHARGEMENT'.split('').map((item, i) => (
                <span key={i} className={'inline-block my-0 mx-1 blur-0 animate-loading' + i}>
                    {item}
                </span>
            ))}
        </div>
    );
}
