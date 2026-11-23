using System;
using System.Security.Cryptography;
using System.Text;

/// <summary>
/// Minimal Windows DPAPI helper for AuthNook device binding.
/// Reads base64 input from stdin, writes base64 output to stdout.
/// Exit codes: 0 = success, 1 = unexpected error, 2 = invalid args, 3 = DPAPI unprotect failed.
/// </summary>
internal static class AuthNookDpapi
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("app.authnook.desktop/device/v1");

    private static int Main(string[] args)
    {
        byte[] input = null;
        byte[] output = null;
        try
        {
            if (args.Length != 1)
            {
                return 2;
            }

            string line = Console.In.ReadLine();
            if (string.IsNullOrEmpty(line))
            {
                return 2;
            }

            input = Convert.FromBase64String(line.Trim());

            if (args[0] == "protect")
            {
                output = ProtectedData.Protect(input, Entropy, DataProtectionScope.CurrentUser);
            }
            else if (args[0] == "unprotect")
            {
                output = ProtectedData.Unprotect(input, Entropy, DataProtectionScope.CurrentUser);
            }
            else
            {
                return 2;
            }

            Console.Out.Write(Convert.ToBase64String(output));
            Console.Out.Flush();
            return 0;
        }
        catch (CryptographicException)
        {
            return 3;
        }
        catch
        {
            return 1;
        }
        finally
        {
            if (input != null) Array.Clear(input, 0, input.Length);
            if (output != null) Array.Clear(output, 0, output.Length);
        }
    }
}
