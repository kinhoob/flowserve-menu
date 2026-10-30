# Flux Digital Menu

You are a senior full-stack SaaS architect and UI/UX engineer specialized in building scalable production-grade platforms using Next.js 15 App Router, TypeScript, Tailwind CSS, Prisma, PostgreSQL, and modern SaaS architecture.

Your task is to build a complete SaaS product called:

# Flux — Digital Menu SaaS for Bars & Restaurants

The platform must feel premium, modern, scalable, and commercially viable.

━━━━━━━━━━━━━━━━━━━

STACK & ARCHITECTURE

━━━━━━━━━━━━━━━━━━━

Use:

- Next.js 15 (App Router)

- TypeScript

- Tailwind CSS

- Shadcn/UI

- Lucide Icons

- Zustand or Context API for lightweight state

- Prisma ORM

- PostgreSQL

- NextAuth/Auth.js authentication

- Stripe subscriptions

- React Hook Form + Zod validation

- Framer Motion animations

- React Query / TanStack Query

- PDF generation for QR exports

- QR Code generation library

- Clean scalable folder architecture

- Server Actions whenever appropriate

- Edge-ready architecture when possible

Project structure must be enterprise-level and maintainable.

━━━━━━━━━━━━━━━━━━━

VISUAL IDENTITY

━━━━━━━━━━━━━━━━━━━

Style reference:

- Nuvemshop

- Stripe Dashboard

- Linear

- Vercel Dashboard

Visual style:

- Dark Premium Minimalism

Color palette:

- Background: #111111

- Surface Cards: #1A1A1A

- Borders: #2A2A2A

- Primary Accent: #D4AF37

- Main Text: #F5F1EB

- Secondary Text: #B8B1A7

- Success: subtle green

- Danger: subtle red

Design requirements:

- Soft shadows

- Large spacing

- Smooth hover animations

- Rounded-2xl cards

- Elegant typography

- Professional SaaS appearance

- Fully responsive

- Mobile-first

- Beautiful loading states

- Skeleton loaders

- Empty states

- Toast notifications

- Consistent spacing system

━━━━━━━━━━━━━━━━━━━

SAAS CORE FEATURES

━━━━━━━━━━━━━━━━━━━

Implement a REAL SaaS architecture.

Each restaurant must have isolated data using multi-tenant architecture.

Entities:

- Users

- Restaurants

- Tables

- Categories

- Menu Items

- Orders

- Order Items

- Customers

- QR Codes

- Subscription Plans

━━━━━━━━━━━━━━━━━━━

AUTHENTICATION

━━━━━━━━━━━━━━━━━━━

Implement:

- Login

- Register

- Forgot password

- Session persistence

- Protected routes

- Middleware auth guards

- Restaurant onboarding flow

━━━━━━━━━━━━━━━━━━━

SUBSCRIPTIONS

━━━━━━━━━━━━━━━━━━━

Implement Stripe subscription system:

Plans:

1. Starter

2. Pro

3. Enterprise

Features:

- Monthly billing

- Upgrade/downgrade

- Usage limits

- Billing page

- Subscription status

- Trial period

- Webhook handling

━━━━━━━━━━━━━━━━━━━

DASHBOARD

━━━━━━━━━━━━━━━━━━━

Create a premium dashboard homepage after login.

Include:

- Welcome section

- Metrics cards

- Orders today

- Revenue today

- Active tables

- Popular items

- Quick actions

- Recent activity

- Performance graphs

- Navigation sidebar

- Responsive collapsible sidebar

Dashboard should feel like a real SaaS admin panel.

━━━━━━━━━━━━━━━━━━━

PUBLIC DIGITAL MENU

━━━━━━━━━━━━━━━━━━━

Customers access via QR Code.

URL format:

?table=XX

Features:

- Customer name modal on first access

- Category tabs

- Search bar

- Floating cart

- Add observations/notes

- Quantity selector

- Real-time order updates

- "My Orders" section

- Table session persistence

- Beautiful mobile UI

- Sticky bottom cart

- Smooth animations

- Product availability status

- Estimated preparation time

━━━━━━━━━━━━━━━━━━━

BAR / KITCHEN PANEL

━━━━━━━━━━━━━━━━━━━

Real-time operational dashboard.

Features:

- Live incoming orders

- Sound notification

- Filters by:

  - table

  - status

  - time

- Kanban-style order columns:

  - New

  - Preparing

  - Ready

  - Delivered

- Change order status

- Order details modal

- Table totals

- Close table

- Revenue counters

- Auto refresh

- Responsive tablet-friendly layout

━━━━━━━━━━━━━━━━━━━

MENU ADMIN PANEL

━━━━━━━━━━━━━━━━━━━

CRUD system for restaurant management.

Features:

- Create/edit/delete categories

- Create/edit/delete products

- Upload product images

- Price management

- Availability toggle

- Product descriptions

- Drag-and-drop ordering

- Category organization

- Inventory visibility

- Form validation

━━━━━━━━━━━━━━━━━━━

QR CODE GENERATOR

━━━━━━━━━━━━━━━━━━━

Features:

- Define number of tables

- Generate unique QR Codes

- Download PNG

- Download PDF sheet

- Restaurant branding on QR

- Batch generation

━━━━━━━━━━━━━━━━━━━

EXTRA PREMIUM FEATURES

━━━━━━━━━━━━━━━━━━━

Implement additional SaaS-grade features:

- Real-time updates with websockets or polling

- Notification system

- Activity logs

- Settings page

- Restaurant profile customization

- Theme persistence

- Keyboard shortcuts

- Command palette

- Analytics dashboard

- Mobile navigation

- Pagination

- Optimistic UI updates

- Error boundaries

- Global error handling

- Empty states

- SEO optimization

- Metadata optimization

- Performance optimization

- Lazy loading

- Dynamic imports

- Image optimization

━━━━━━━━━━━━━━━━━━━

DATABASE DESIGN

━━━━━━━━━━━━━━━━━━━

Create Prisma schema with proper relations.

Include:

- IDs

- timestamps

- indexes

- relational integrity

- enums for statuses

- scalable multi-tenant structure

━━━━━━━━━━━━━━━━━━━

FOLDER STRUCTURE

━━━━━━━━━━━━━━━━━━━

Create a scalable structure like:

/app

/components

/components/ui

/features

/lib

/services

/hooks

/store

/providers

/actions

/prisma

/types

/utils

/styles

━━━━━━━━━━━━━━━━━━━

CODE QUALITY

━━━━━━━━━━━━━━━━━━━

Requirements:

- Clean Architecture principles

- Reusable components

- Separation of concerns

- Well-commented code

- Strong typing everywhere

- Accessibility best practices

- Production-ready patterns

- Maintainable codebase

- Senior-level conventions

━━━━━━━━━━━━━━━━━━━

DELIVERY ORDER

━━━━━━━━━━━━━━━━━━━

Build in this order:

1. Project structure

2. Theme and layout

3. Authentication

4. Database schema

5. Dashboard

6. Public Menu

7. Bar Panel

8. Admin Panel

9. QR Generator

10. Stripe Billing

11. Real-time system

12. Final polish

━━━━━━━━━━━━━━━━━━━

IMPORTANT

━━━━━━━━━━━━━━━━━━━

- Do NOT create simplistic beginner-level code.

- Build this like a real funded startup SaaS.

- Avoid generic UI.

- Components must look polished and modern.

- Use realistic dummy data initially when necessary.

- Keep code modular and scalable.

- Every screen must feel production-ready.

- Prioritize UX and responsiveness.

- Think like a senior SaaS engineer and product designer.

Start by generating:

1. Full folder architecture

2. Prisma schema

3. Global theme setup

4. Main layout

5. Initial dashboard page

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2b7608ef-e90e-4bb7-a850-830dcb920ec8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
