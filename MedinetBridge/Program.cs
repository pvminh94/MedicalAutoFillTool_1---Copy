using System.Net;
using System.Text.Json;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Web.WebView2.Core;

namespace MedinetBridge;

class FillRequest
{
    public List<List<string>>? Data { get; set; }
    public List<string>? Headers { get; set; }
}

class Program
{
    private static WebView2? webView;
    private static Form? mainForm;
    private static HttpListener? httpListener;
    private static string? currentScript;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    [STAThread]
    static void Main(string[] args)
    {
        Console.WriteLine("=== Medical Auto Fill - Medinet Bridge ===");
        Console.WriteLine("Chay web server nhan lenh fill tu web app");
        Console.WriteLine("----------------------------------------");

        var httpThread = new Thread(RunHttpServer);
        httpThread.Start();

        ApplicationConfiguration.Initialize();

        mainForm = new Form
        {
            Text = "Medical Auto Fill Bridge",
            Width = 1024,
            Height = 768,
            WindowState = FormWindowState.Minimized,
            ShowInTaskbar = true,
            FormBorderStyle = FormBorderStyle.SizableToolWindow
        };

        webView = new WebView2
        {
            Dock = DockStyle.Fill,
            Source = new Uri("https://quanlyskcd.medinet.org.vn/account/login")
        };

        mainForm.Controls.Add(webView);

        webView.CoreWebView2InitializationCompleted += (s, e) =>
        {
            Console.WriteLine("WebView2 da san sang!");
            Console.WriteLine("Da mo medinet.org.vn");
            Console.WriteLine("----------------------------------------");

            webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;

            webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                "window.__MAF_bridge = true; console.log('[MAF Bridge] San sang nhan lenh fill!');"
            );

            webView.CoreWebView2.NavigationCompleted += (s2, e2) =>
            {
                Console.WriteLine("Da load: " + webView.CoreWebView2.Source);

                if (currentScript != null)
                {
                    Console.WriteLine("Dang fill du lieu len medinet...");
                    webView.CoreWebView2.ExecuteScriptAsync(currentScript);
                    currentScript = null;
                }
            };
        };

        Application.Run(mainForm);
    }

    static void RunHttpServer()
    {
        try
        {
            httpListener = new HttpListener();
            httpListener.Prefixes.Add("http://127.0.0.1:5119/");
            httpListener.Start();
            Console.WriteLine("HTTP server lang nghe tai http://127.0.0.1:5119/");
            Console.WriteLine("----------------------------------------");

            while (true)
            {
                try
                {
                    var context = httpListener.GetContext();
                    var req = context.Request;
                    var resp = context.Response;

                    if (req.HttpMethod == "POST" && req.Url?.AbsolutePath == "/fill")
                    {
                        HandleFillRequest(req, resp);
                    }
                    else if (req.HttpMethod == "GET")
                    {
                        var responseString = JsonSerializer.Serialize(new
                        {
                            status = "running",
                            timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                            message = "Medinet Bridge dang chay"
                        }, JsonOptions);
                        var buffer = System.Text.Encoding.UTF8.GetBytes(responseString);
                        resp.ContentType = "application/json";
                        resp.ContentLength64 = buffer.Length;
                        resp.OutputStream.Write(buffer, 0, buffer.Length);
                    }
                    else
                    {
                        resp.StatusCode = 404;
                    }

                    resp.OutputStream.Close();
                }
                catch (Exception ex)
                {
                    Console.WriteLine("HTTP Error: " + ex.Message);
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("HTTP Server Error: " + ex.Message);
        }
    }

    static void HandleFillRequest(HttpListenerRequest req, HttpListenerResponse resp)
    {
        try
        {
            using var reader = new StreamReader(req.InputStream, req.ContentEncoding);
            var body = reader.ReadToEnd();

            var request = JsonSerializer.Deserialize<FillRequest>(body, JsonOptions);
            if (request?.Data == null || request.Data.Count == 0)
            {
                WriteJsonResponse(resp, new { success = false, message = "Khong co du lieu" });
                return;
            }

            var script = BuildFillScript(request.Data);

            if (webView?.CoreWebView2 != null)
            {
                Console.WriteLine("Dang fill " + request.Data.Count + " dong len medinet...");

                if (mainForm != null)
                {
                    var tcs = new TaskCompletionSource<bool>();
                    mainForm.BeginInvoke(async () =>
                    {
                        try
                        {
                            await webView.CoreWebView2.ExecuteScriptAsync(script);
                            tcs.SetResult(true);
                        }
                        catch (Exception ex)
                        {
                            tcs.SetException(ex);
                        }
                    });

                    if (tcs.Task.Wait(TimeSpan.FromSeconds(10)))
                    {
                        WriteJsonResponse(resp, new { success = true, message = "Da fill " + request.Data.Count + " dong len medinet!" });
                    }
                    else
                    {
                        WriteJsonResponse(resp, new { success = false, message = "Timeout cho WebView2" });
                    }
                }
                else
                {
                    WriteJsonResponse(resp, new { success = false, message = "MainForm chua san sang" });
                }
            }
            else
            {
                currentScript = script;
                Console.WriteLine("WebView2 chua san sang, da luu script...");
                WriteJsonResponse(resp, new { success = true, message = "WebView2 dang khoi dong, se tu dong fill sau" });
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("Fill Error: " + ex.Message);
            WriteJsonResponse(resp, new { success = false, message = "Loi: " + ex.Message });
        }
    }

    static string BuildFillScript(List<List<string>> rows)
    {
        var data = rows.Count > 0 ? rows[0] : new List<string>();
        var dataJson = JsonSerializer.Serialize(data, JsonOptions);

        var js = @"
(function(){
  var data=" + dataJson + @";
  var ok=0,miss=0;
  var fieldMap=[
    {idx:0,labels:['makcb','ma kcb']},
    {idx:1,labels:['hoten','ho ten','ho va ten']},
    {idx:2,labels:['ngaysinh','ngay sinh','nam sinh']},
    {idx:3,labels:['gioitinh','gioi tinh']},
    {idx:4,labels:['dantoc','dan toc']},
    {idx:5,labels:['mabhyt','ma bhyt','bao hiem y te']},
    {idx:6,labels:['ngaykham','ngay kham','ngay vao']},
    {idx:7,labels:['bacsy','bac sy','bac si']},
    {idx:8,labels:['chan doan','chan doan']},
    {idx:9,labels:['mau','xet nghiem mau']},
    {idx:10,labels:['nuoctieu','nuoc tieu','xet nghiem nuoc tieu']},
    {idx:11,labels:['glucose','glucose','duong huyet']},
    {idx:12,labels:['ure','ure','urea']},
    {idx:13,labels:['creatinin','creatinin','creatinine']},
    {idx:14,labels:['got','got','ast']},
    {idx:15,labels:['gpt','gpt','alt']},
    {idx:16,labels:['cholesterol','cholesterol']},
    {idx:17,labels:['triglycerid','triglycerid','triglyceride']},
    {idx:18,labels:['hdl','hdl-cholesterol']},
    {idx:19,labels:['ldl','ldl-cholesterol']},
    {idx:20,labels:['bili tp','bilirubin tp','bilirubin toan phan']},
    {idx:21,labels:['bili tt','bilirubin tt','bilirubin truc tiep']},
    {idx:22,labels:['bili gt','bilirubin gt','bilirubin gian tiep']},
    {idx:23,labels:['protein','protein toan phan']},
    {idx:24,labels:['albumin','albumin']},
    {idx:25,labels:['globulin','globulin']},
    {idx:26,labels:['men tim','men tim']},
    {idx:27,labels:['ck-mb','ck-mb']},
    {idx:28,labels:['troponin','troponin','tnt']},
    {idx:29,labels:['crp','crp']},
    {idx:30,labels:['mau lam','mau lang']},
    {idx:31,labels:['sat','sat huyet thanh']},
    {idx:32,labels:['ferritin','ferritin']}
  ];
  function findInput(labels){
    var keys=labels.map(function(l){return String(l).toLowerCase().trim();});
    var els=document.querySelectorAll('label,span,div,td,th,p,b,strong');
    var found=null;
    Array.prototype.forEach.call(els,function(el){
      var t=el.innerText?el.innerText.toLowerCase().trim():'';
      if(keys.indexOf(t)>=0){
        var container=el.closest('.dx-field,.form-group,.row,div')||el.parentElement;
        var input=container?container.querySelector('input:not([type=hidden]),textarea'):null;
        if(!input){
          var lr=el.getBoundingClientRect();
          var inputs=document.querySelectorAll('input:not([type=hidden]),textarea');
          var best=null,min=999999;
          Array.prototype.forEach.call(inputs,function(inp){
            var ir=inp.getBoundingClientRect();
            if(ir.top>=lr.bottom-10&&ir.top<=lr.bottom+60&&ir.left>=lr.left-20&&ir.left<=lr.left+80){
              var d=Math.abs(ir.top-lr.bottom);
              if(d<min){min=d;best=inp;}
            }
          });
          input=best;
        }
        if(input)found=input;
      }
    });
    return found;
  }
  function setVal(input,val){
    if(!input)return false;
    input.focus();
    input.value=val;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    input.dispatchEvent(new Event('blur',{bubbles:true}));
    return true;
  }
  fieldMap.forEach(function(f){
    var raw=data[f.idx];
    if(raw===undefined||raw===null||String(raw).trim()==='')return;
    var inp=findInput(f.labels);
    if(inp&&setVal(inp,String(raw).trim()))ok++;else miss++;
  });
  console.log('[MAF Bridge] Fill xong: '+ok+' OK, '+miss+' thieu');
})();
";
        return js;
    }

    static void WriteJsonResponse(HttpListenerResponse resp, object obj)
    {
        var json = JsonSerializer.Serialize(obj, JsonOptions);
        var buffer = System.Text.Encoding.UTF8.GetBytes(json);
        resp.ContentType = "application/json";
        resp.ContentLength64 = buffer.Length;
        resp.OutputStream.Write(buffer, 0, buffer.Length);
    }
}