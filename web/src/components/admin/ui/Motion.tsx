'use client';

import { motion, HTMLMotionProps } from 'framer-motion';
import { forwardRef } from 'react';

// Wrapper components to handle strict type checking issues with framer-motion in React 19/Next.js
// using 'as any' cast internally so strict consumers don't have to.

export const MotionDiv = motion.div as any;

export const MotionSpan = motion.span as any;

export const MotionButton = motion.button as any;

export const MotionAside = motion.aside as any;