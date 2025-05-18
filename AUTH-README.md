# Authentication Setup for Products Mapping App

This document explains the authentication system for the Products Mapping application.

## Overview

The application has been secured with admin-only authentication. Only the admin user with the correct credentials can access the application. This is implemented using Supabase authentication.

## Admin Credentials

The admin user has already been created in Supabase with the following credentials:

- **Email**: tahir@leverify.com
- **Password**: S@hiwal900KM

You can use these credentials to log in to the application.

## How Authentication Works

1. The application includes a login screen at `/login`.
2. All other routes are protected and require authentication.
3. When a user tries to access any route without being logged in, they are redirected to the login page.
4. Only the admin user with the correct email and password can log in.
5. After login, the user's session is maintained using Supabase Auth.
6. A logout button is available in the header to sign out.

## Admin User Management

If you need to manage the admin user (reset password, etc.), you can do so through the Supabase Management Console:

1. Log in to your Supabase dashboard at https://app.supabase.com
2. Select your project from the dashboard
3. Navigate to "Authentication" → "Users" in the left sidebar
4. Find the user with email "tahir@leverify.com"
5. Use the options menu to manage the user account

## Notes for Developers

- The authentication logic is in `src/context/AuthContext.tsx`
- The login page is in `src/pages/Login/Login.tsx`
- Protected routes are managed by `src/components/ProtectedRoute/ProtectedRoute.tsx`

## Security Considerations

- The admin password should be changed regularly for security.
- For production, it's recommended to enable additional security features like multi-factor authentication.
- Consider implementing rate limiting for login attempts to prevent brute force attacks. 