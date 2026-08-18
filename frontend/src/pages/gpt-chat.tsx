import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatStudioApp } from '../features/chat-studio/app';
import { mountStudioTheme } from '../shared/theme';

mountStudioTheme();
const root = document.getElementById('chatStudioApp');
if (!root) throw new Error('Missing #chatStudioApp');
createRoot(root).render(<StrictMode><ChatStudioApp /></StrictMode>);

