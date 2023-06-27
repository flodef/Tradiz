import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center h-screen">
            <p className="text-4xl font-bold">Page Not Found</p>
            <p className="text-2xl">404</p>
            <p className="text-xl">Oops! Something is wrong.</p>
            <p>Sorry, we couldn't find the page you're looking for.</p>
            <br></br>
            <p>
                Go back{' '}
                <Link className="underline" href="/">
                    home
                </Link>
            </p>
        </div>
    );
}
