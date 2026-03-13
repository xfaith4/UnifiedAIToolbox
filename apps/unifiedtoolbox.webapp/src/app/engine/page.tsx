'use client';
import { Suspense } from 'react';
import App from './_source/App';

export default function EnginePage() {
    return (
        <Suspense>
            <App />
        </Suspense>
    );
}
