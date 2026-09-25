using System;
using System.Threading;
using System.Windows.Forms;

namespace MedicalAutoFillTool
{
    static class Program
    {
        private static Mutex? mutex;

        [STAThread]
        static void Main()
        {
            // Đảm bảo chỉ cho phép MỘT CHƯƠNG TRÌNH DUY NHẤT chạy trên máy
            const string mutexName = "MedicalAutoFillTool_SingleInstance_Mutex";
            mutex = new Mutex(true, mutexName, out bool isNewInstance);

            if (!isNewInstance)
            {
                MessageBox.Show("phần mềm đang chạy!", "Thông báo", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            ApplicationConfiguration.Initialize();
            Application.Run(new Form1());

            mutex.ReleaseMutex();
        }
    }
}