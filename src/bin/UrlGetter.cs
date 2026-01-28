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
                if (handle == IntPtr.Zero) continue;

                AutomationElement element = AutomationElement.FromHandle(handle);
                
                // Speed optimization: Look specifically for the URL bar by name/type
                // Chrome/Edge/Brave address bars are 'Edit' types with specific names
                Condition cond = new AndCondition(
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit),
                    new OrCondition(
                        new PropertyCondition(AutomationElement.NameProperty, "Address and search bar"),
                        new PropertyCondition(AutomationElement.NameProperty, "Search or enter website name")
                    )
                );

                AutomationElement urlBar = element.FindFirst(TreeScope.Descendants, cond);

                if (urlBar != null) {
                    ValuePattern vp = urlBar.GetCurrentPattern(ValuePattern.Pattern) as ValuePattern;
                    string currentUrl = vp.Current.Value;

                    if (!string.IsNullOrEmpty(currentUrl) && currentUrl != lastUrl) {
                        Console.WriteLine(currentUrl);
                        lastUrl = currentUrl;
                    }
                }
            } catch { 
                // Catching errors is good, prevents the engine from crashing on non-browser windows
            }
            
            // 1500ms is the "sweet spot" for performance vs accuracy
            Thread.Sleep(1500); 
        }
    }
}