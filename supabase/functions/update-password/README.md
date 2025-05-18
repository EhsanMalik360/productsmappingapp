# Update Password Edge Function

This Edge Function securely updates user passwords in Supabase. It ensures that only administrators can update passwords and uses the Supabase Admin API to perform the password change.

## Deployment

To deploy this function to your Supabase project:

1. Install the Supabase CLI if you haven't already:
   ```bash
   npm install -g supabase
   ```

2. Login to your Supabase account:
   ```bash
   supabase login
   ```

3. Deploy the function:
   ```bash
   supabase functions deploy update-password --project-ref wvgiaeuvyfsdhoxrjmib
   ```

## Usage

The function expects a POST request with a JSON body containing:

```json
{
  "userId": "user-uuid-to-update",
  "newPassword": "new-password-to-set",
  "requesterId": "admin-user-uuid"
}
```

The function will:
1. Verify the requester is an admin
2. Update the user's password
3. Return a success response

## Security

- This function uses Supabase's service role key which has admin privileges
- It verifies that the requester has admin role before allowing password changes
- It's protected by Supabase authentication - only authenticated users can call it

## Notes

When a user's password is updated using this function, they will:
- No longer be able to log in with their old password
- Need to use the new password for future logins
- Not be logged out of existing sessions automatically 