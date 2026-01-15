using System;
using System.Windows.Automation;
using System.Runtime.InteropServices;
using System.Threading;

class UrlGetter {
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    static void Main() {
        string lastUrl = "";
        while (true) {
            try {
                IntPtr handle = GetForegroundWindow();
                AutomationElement element = AutomationElement.FromHandle(handle);

                // Look for the 'Edit' control (the URL bar)
                Condition cond = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit);
                AutomationElement urlBar = element.FindFirst(TreeScope.Descendants, cond);

                if (urlBar != null) {
                    // Extract the text value from the address bar
                    ValuePattern vp = urlBar.GetCurrentPattern(ValuePattern.Pattern) as ValuePattern;
                    string currentUrl = vp.Current.Value;

                    if (currentUrl != lastUrl) {
                        Console.WriteLine(currentUrl); // This sends data to Node.js
                        lastUrl = currentUrl;
                    }
                }
            } catch { /* Ignore windows that don't have URL bars */ }
            Thread.Sleep(1000); // Check every second
        }
    }
}