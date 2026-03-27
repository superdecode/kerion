<?php $strTitle = "Lazada Marketplace Sync API"; session_name("MarketPlaceSync"); session_start(); ?>
<html lang="en-US">
<head>
    <title><?php echo $strTitle;?></title>
</head>
<body>
<script src="./js/jquery-1.12.3.js"></script>
<style type="text/css">
    .tab {
        overflow: hidden;
        border: 1px solid #ccc;
        background-color: #f1f1f1;
	}
	.tab button {
        background-color: inherit;
        float: left;
        border: none;
        outline: none;
        cursor: pointer;
        padding: 14px 16px;
        transition: 0.3s;
    }
    .tab button:hover {
        background-color: #ddd;
    }
    .tab button.active {
        background-color: #ccc;
    }
    .tabcontent, .tabcontent2 {
        display: none;
        padding: 6px 12px;
        border: 1px solid #ccc;
        border-top: none;
    }
	.tabcontent, .tabcontent2 {
        animation: fadeEffect 1s; /* Fading effect takes 1 second */
    }
    @keyframes fadeEffect {
        from {opacity: 0;}
        to {opacity: 1;}
    }
    </style>
    <script type="text/javascript">
    function openCity(cityName) {
        // Declare all variables
        var i, tabcontent, tablinks;
        // Get all elements with class="tabcontent" and hide them
        tabcontent = document.getElementsByClassName("tabcontent");
        for (i = 0; i < tabcontent.length; i++) {
            tabcontent[i].style.display = "none";
        }
        // Get all elements with class="tablinks" and remove the class "active"
        //tablinks = document.getElementsByClassName("tablinks");
        //for (i = 0; i < tablinks.length; i++) {
        //    tablinks[i].className = tablinks[i].className.replace(" active", "");
        //}
        // Show the current tab, and add an "active" class to the button that opened the tab
        document.getElementById(cityName).style.display = "block";
    }
    </script>
    <?php 
	error_reporting(E_ALL);
	ini_set('display_errors', 1);
	
	$strRedirectURL = "https://testsite.co.in/lazada/_lazada_auth/eTF7NHeGZsuDXFr4.php";
	$strLazadaAPIKey = "Ps3yKuBDEH0V-toWTGioQPMsgjnVCRG1kFHx6cmqDzrUyntomZ46TdTP";//
	$intLazadaShopID = "MY4N9OEVZM";//
	$strLazadaAppKey = "125985";//125923
	$strLazadaAppSecret = "sq4X5ncKXjGTbpjAcE8a1fJzXYS9MukI";//ssO3lAxJUNIaHjv2nBVTEPJ2k9uVsnl7
	//$strRedirectURL = ""; $strLazadaAPIKey = ""; $intLazadaShopID = ""; $strLazadaAppKey = ""; $strLazadaAppSecret = "";
	$strTabType = "";
	if(isset($_REQUEST["f_submit"]) && $_REQUEST["f_submit"]!="") {
		//echo "<pre>";print_r($_REQUEST);echo "</pre>";exit;
		$strRedirectURL = (isset($_REQUEST["a5"])?$_REQUEST["a5"]:"");
		$strLazadaAPIKey = (isset($_REQUEST["a1"])?$_REQUEST["a1"]:"");
		$intLazadaShopID = (isset($_REQUEST["a2"])?$_REQUEST["a2"]:"");
		$strLazadaAppKey = (isset($_REQUEST["a3"])?$_REQUEST["a3"]:"");
		$strLazadaAppSecret = (isset($_REQUEST["a4"])?$_REQUEST["a4"]:"");
	}
	if(isset($_REQUEST["type"]) && $_REQUEST["type"]!="") {
		$strTabType = $_REQUEST["type"];
	}
	
	include_once "./lazop-sdk-php/LazopSdk.php";
	$c = new LazopClient('https://api.lazada.com.my/rest', $strLazadaAppKey, $strLazadaAppSecret);
	
	if(isset($_REQUEST["opt"]) && $_REQUEST["opt"]=="ajax") {
		$strType = (isset($_REQUEST["type"])?$_REQUEST["type"]:"category");
		if($strType=="category") {
			$intCatID = (isset($_REQUEST["cid"])?$_REQUEST["cid"]:"");
			$_SESSION["category_id"] = $intCatID;
			$request = new LazopRequest('/category/attributes/get','GET');
			$request->addApiParam('primary_category_id', $intCatID);
			$arrResults = $c->execute($request);
			$arrResults = json_decode($arrResults, true);
			$arrReturns = (isset($arrResults["data"])?$arrResults["data"]:array());
			
			if(count($arrReturns)>0) {
				$strAttribute = "";
				$strAttribute .= "
					<strong><h3>Attributes</h3></strong>
				";
				$strAttribute .= "<table>";
				//$_SESSION["attributes_id"] = array(); $_SESSION["attributes_name"] = array();
				foreach($arrReturns as $keyReturns => $valueReturns) {
					//$strAttribute .= "<pre>";print_r($valueReturns);echo "</pre>";
					//echo "<pre>";print_r($valueReturns["options"]);echo "</pre>";
					$strSelAttributes = "";
					if($valueReturns["input_type"]=="richText"||$valueReturns["input_type"]=="text") {
						$strSelAttributes .= "<input type='text' name='".$valueReturns["name"]."' value='' />";
					} else {
						$strSelAttributes .= "<select name='attributes[]'>";
						if($valueReturns["is_mandatory"]!="1") {
							$strSelAttributes .= "<option value=''>Select option..</option>";
						} else if($valueReturns["is_mandatory"]=="1"&&count($valueReturns["options"])==0) {
							$strSelAttributes .= "<option value=''>-</option>";
						}
						if(count($valueReturns["options"])>0) {
							foreach($valueReturns["options"] as $keyOption => $valueOption) {
								if($valueReturns["is_mandatory"]=="1" && $keyOption=="0") {
									//$_SESSION["attributes_id"][] = 0; //$valueReturns["attribute_id"];
									//$_SESSION["attributes_name"][] = $valueOption;
								}
								$strSelAttributes .= "<option value='".$valueOption["name"]."'>".$valueOption["name"]."</option>";
							}
						}
						$strSelAttributes .= "</select>";
						$strSelAttributes .= "<input type='hidden' name='attributes_id[]' value='0'>";
					}
					$strAttribute .= "<tr><td>".$valueReturns["label"].($valueReturns["is_mandatory"]!="1"?" (Optional)":"")."</td><td>:</td><td>".$strSelAttributes."</td></tr>";
				}
				$strAttribute .= "</table>";
				echo $strAttribute;
			}
		} else if($strType=="brand") {
			$strBrand = (isset($_REQUEST["brand"])?$_REQUEST["brand"]:"");
			$_SESSION["brand"] = $strBrand;
		}
		exit;
	}
	?>
    <div style="padding:20px 100px 0 100px;">
    	<div>
        	<form id="form1" name="form1" enctype="multipart/form-data" method="get">
            	<input type="hidden" id="f_submit" name="f_submit" value="1" />
                <table style="position:relative;border:1px groove black;width:100%;">
                    <tr>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td style="width:85%;"><h3><a href="./the_lazada.php"><?php echo $strTitle; ?></a></h3></td>
                    </tr>
                    <tr>
                        <td align="right">Auth Callback URL</td>
                        <td>:</td>
                        <td><input type="text" id="a5" name="a5" value="<?php echo $strRedirectURL;?>" style="width:100%;" /></td>
                    </tr>
                    <tr>
                        <td align="right">Lazada API Key</td>
                        <td>:</td>
                        <td><input type="text" id="a1" name="a1" value="<?php echo $strLazadaAPIKey;?>" style="width:100%;" /></td>
                    </tr>
                    <tr>
                        <td align="right">Lazada Shop ID</td>
                        <td>:</td>
                        <td><input type="text" id="a2" name="a2" value="<?php echo $intLazadaShopID;?>" style="width:100%;" /></td>
                    </tr>
                    <tr>
                        <td align="right">Lazada App Key</td>
                        <td>:</td>
                        <td><input type="text" id="a3" name="a3" value="<?php echo $strLazadaAppKey;?>" style="width:100%;" /></td>
                    </tr>
                    <tr>
                        <td align="right">Lazada App Secret</td>
                        <td>:</td>
                        <td><input type="text" id="a4" name="a4" value="<?php echo $strLazadaAppSecret;?>" style="width:100%;" /></td>
                    </tr>
                    <tr>
                        <td align="right">Others</td>
                        <td>:</td>
                        <td>
                        	<strong>Catergory ID</strong>: <?php if(isset($_SESSION["category_id"])) { echo $_SESSION["category_id"]; }?><br />
                        	<strong>Brand</strong>: <?php if(isset($_SESSION["brand"])) { echo $_SESSION["brand"]; }?><br />
                            <strong>Seller SKUs</strong>: <?php if(isset($_SESSION["skus"]) && is_array($_SESSION["skus"])) { echo implode(";", $_SESSION["skus"]); }?>
                        </td>
                    </tr>
                    <tr>
                        <td colspan="3" style="text-align: center;">
                            <input type="submit" value="GO" style="margin-top:20px;padding:10px 20px 10px 20px;">
                        </td>
                    </tr>
                </table>
            </form>
        </div>
        <br />
        
        <?php if($strRedirectURL!="" && $strLazadaAPIKey!="" && $intLazadaShopID!="" && $strLazadaAppKey!="" && $strLazadaAppSecret!="") { ?>
			<?php 
			function priorCategoryName($arrOrigCategories, $parent_id, $has_children) {
				foreach($arrOrigCategories as $keyCategory => $valueCategory) {
					if($parent_id!="0" && $valueCategory["category_id"]==$parent_id) { return $valueCategory; break; }
				} return array();
			} ?>
        	<script type="text/javascript">
			function changeCategory(val) {
				$.ajax({url: '<?php echo "./the_lazada.php?f_submit=1&a1=".$strLazadaAPIKey."&a2=".$intLazadaShopID."&a3=".$strLazadaAppKey."&a4=".$strLazadaAppSecret."&a5=".$strRedirectURL."&opt=ajax&type=category&cid=";?>'+val, success: function(result){
						$("#attribute_id").removeAttr("style");
						$("#attribute_id").html(result);
					}
				});
			}
			function changeBrand(val) {
				$.ajax({url: '<?php echo "./the_lazada.php?f_submit=1&a1=".$strLazadaAPIKey."&a2=".$intLazadaShopID."&a3=".$strLazadaAppKey."&a4=".$strLazadaAppSecret."&a5=".$strRedirectURL."&opt=ajax&type=brand&brand=";?>'+val, success: function(result){
						//$("#attribute_id").removeAttr("style");
						//$("#attribute_id").html(result);
					}
				});
			}
			</script>
			<style scoped>
                @import "css/bootstrap-iso.css";
            </style>
            
            <?php //unset($_SESSION["lazada_access_token"]);
				if(isset($_GET["updaccesstoken"])&&isset($_GET["lazada_code"])&&$_GET["lazada_code"]!="") {
					$strCode = $_GET["lazada_code"];
					$request = new LazopRequest('/auth/token/create');
					$request->addApiParam('code',$strCode);
					$arrResults = $c->execute($request);
					$arrResults = json_decode($arrResults, true);
					if(isset($arrResults["access_token"]) && $arrResults["access_token"]!="") {
						$_SESSION["lazada_access_token"] = $arrResults["access_token"];
					}
				}
				if(!isset($_SESSION["lazada_access_token"])) { ?>
                <div class="tab"><strong>Note</strong>: <em>Just require for 1 time, to generate the access token.</em></div>
                <div class="tabcontent2" style="display:block;">
                    <p>
                        <form id="form2" name="form2" enctype="multipart/form-data" method="get">
                            <input type="hidden" id="f_submit" name="f_submit" value="1" />
                            <input type="hidden" id="a1" name="a1" value="<?php echo $strLazadaAPIKey;?>" />
                            <input type="hidden" id="a2" name="a2" value="<?php echo $intLazadaShopID;?>" />
                            <input type="hidden" id="a3" name="a3" value="<?php echo $strLazadaAppKey;?>" />
                            <input type="hidden" id="a4" name="a4" value="<?php echo $strLazadaAppSecret;?>" />
                            <input type="hidden" id="a5" name="a5" value="<?php echo $strRedirectURL;?>" />
                            <input type="hidden" id="updaccesstoken" name="updaccesstoken" value="1" />
                            <div class="bootstrap-iso">
                                <div class="form-group btm_border">
                                    <label class="col-sm-2 control-label" for="demo-hor-1"><?php echo "Lazada Auth Code";?></label>
                                    <div class="col-sm-10">
                                        <input type="text" name="lazada_code" value="" placeholder="<?php echo "Lazada Auth Code";?>" class="form-control required">
                                        (Click <a style="color:green;" href="https://auth.lazada.com/oauth/authorize?response_type=code&force_auth=true&redirect_uri=<?php echo $strRedirectURL;?>&client_id=<?php echo $strLazadaAppKey;?>" target="_blank"><u>Here</u></a> to get your Lazada Code, then copy and paste to the textbox on the left) <?php /* <em>NOTE: Lazada Auth Code will be used to generate Lazada Access Token that valid for 7 days.</em>*/ ?>
                                    </div>
                                </div>
                            </div>
                            <div>&nbsp;</div>
                            <center><input type="submit" value="Update" style="margin-top:20px;padding:10px 20px 10px 20px;"></center>
                        </form>
                    </p>
                </div>
            <?php } else { 
			
				$accessToken = $_SESSION["lazada_access_token"]; ?>
            	
                <div class="tab">
                    <button class="tablinks <?php if($strTabType=="" || $strTabType=="category") { ?> active<?php } ?>" onClick="javascript:window.location.href='<?php echo "./the_lazada.php?f_submit=1&a1=".$strLazadaAPIKey."&a2=".$intLazadaShopID."&a3=".$strLazadaAppKey."&a4=".$strLazadaAppSecret."&a5=".$strRedirectURL."&type=category";?>';">Category</button>
                    <button class="tablinks <?php if($strTabType=="brands") { ?> active<?php } ?>" onClick="javascript:window.location.href='<?php echo "./the_lazada.php?f_submit=1&a1=".$strLazadaAPIKey."&a2=".$intLazadaShopID."&a3=".$strLazadaAppKey."&a4=".$strLazadaAppSecret."&a5=".$strRedirectURL."&type=brands";?>';">Brands</button>
                    <button class="tablinks <?php if($strTabType=="prodlist") { ?> active<?php } ?>" onClick="javascript:window.location.href='<?php echo "./the_lazada.php?f_submit=1&a1=".$strLazadaAPIKey."&a2=".$intLazadaShopID."&a3=".$strLazadaAppKey."&a4=".$strLazadaAppSecret."&a5=".$strRedirectURL."&type=prodlist";?>';">Product Listing</button>
                    <button class="tablinks <?php if($strTabType=="addprod") { ?> active<?php } ?>" onClick="javascript:window.location.href='<?php echo "./the_lazada.php?f_submit=1&a1=".$strLazadaAPIKey."&a2=".$intLazadaShopID."&a3=".$strLazadaAppKey."&a4=".$strLazadaAppSecret."&a5=".$strRedirectURL."&type=addprod";?>';">Add A Product</button>
                    <button class="tablinks <?php if($strTabType=="proddetail") { ?> active<?php } ?>" onClick="javascript:window.location.href='<?php echo "./the_lazada.php?f_submit=1&a1=".$strLazadaAPIKey."&a2=".$intLazadaShopID."&a3=".$strLazadaAppKey."&a4=".$strLazadaAppSecret."&a5=".$strRedirectURL."&type=proddetail";?>';">A Product Details</button>
                    <button class="tablinks <?php if($strTabType=="delprods") { ?> active<?php } ?>" onClick="javascript:window.location.href='<?php echo "./the_lazada.php?f_submit=1&a1=".$strLazadaAPIKey."&a2=".$intLazadaShopID."&a3=".$strLazadaAppKey."&a4=".$strLazadaAppSecret."&a5=".$strRedirectURL."&type=delprods";?>';">Delete Product(s)</button>
                    <button class="tablinks <?php if($strTabType=="orders") { ?> active<?php } ?>" onClick="javascript:window.location.href='<?php echo "./the_lazada.php?f_submit=1&a1=".$strLazadaAPIKey."&a2=".$intLazadaShopID."&a3=".$strLazadaAppKey."&a4=".$strLazadaAppSecret."&a5=".$strRedirectURL."&type=orders";?>';">Order(s)</button>
                </div>
                
                <?php if($strTabType=="" || $strTabType=="category") { ?>
                    <div id="category" class="tabcontent">
                        <h3>Category</h3>
                        <p>
                            <?php 
							$request = new LazopRequest('/category/tree/get','GET');
							$arrResults = $c->execute($request);
							$arrayCategoriesData = json_decode($arrResults, true);
							//echo "<pre>";print_r($arrayCategoriesData);echo "</pre>";exit;
                            $arrCategories = array("" => "Select Category..");
                            function sortCategoryName($arrCategories, $valueCategory, $parent_id, $parent_name) {
                                //echo "<pre>";print_r($valueCategory);echo "</pre>";exit;
                                if(isset($valueCategory) && is_array($valueCategory) && count($valueCategory)>0) {
                                    foreach($valueCategory as $keyInnerCategory => $valueInnerCategory) {
                                        $strNames = $parent_name . " > " . $valueInnerCategory["name"];
                                        if($valueInnerCategory["leaf"]=="1") {
                                            $arrCategories[$valueInnerCategory["category_id"]] = $strNames;
                                        } else {
                                            $arrCategories["child_".$valueInnerCategory["category_id"]] = $strNames;
                                        }
                                        if(isset($valueInnerCategory["children"]) && is_array($valueInnerCategory["children"]) && count($valueInnerCategory["children"])>0) {
                                            $arrCategories = sortCategoryName($arrCategories, $valueInnerCategory["children"], $valueInnerCategory["category_id"], $strNames);
                                        }
                                    }
                                }
                                return $arrCategories;
                            }
                            if(isset($arrayCategoriesData["data"]) && count($arrayCategoriesData["data"])>0) {
                                foreach($arrayCategoriesData["data"] as $keyCategory => $valueCategory) {		
                                    if($valueCategory["leaf"]=="1") {
                                        $arrCategories[$valueCategory["category_id"]] = $valueCategory["name"];
                                    } else {
                                        $arrCategories["child_".$valueCategory["category_id"]] = $valueCategory["name"];
                                    }
                                    if(isset($valueCategory["children"]) && is_array($valueCategory["children"]) && count($valueCategory["children"])>0) {
                                        $arrCategories = sortCategoryName($arrCategories, $valueCategory["children"], $valueCategory["category_id"], $valueCategory["name"]);
                                    }
                                }
                            }
                            //echo "<pre>";print_r($arrCategories);echo "</pre>"; ?>
                            <select name="lazada_category_id" onChange="javascript:changeCategory(this.value);" placeholder="Choose a category" tabindex="-1" data-hide-disabled="true">
                                <?php foreach($arrCategories as $keyCategory => $valueCategory) { ?>
                                    <option value="<?php echo $keyCategory; ?>" <?php if(!is_numeric($keyCategory)&&!empty($keyCategory)) { ?> disabled="disabled" <?php } ?>><?php echo $valueCategory; ?></option>
                                <?php } ?>
                            </select>			
                        </p>
                        <br />
                        <div id="attribute_id" style="display:none;"></div>
                    </div>
                <?php } ?>
                
                <?php if($strTabType=="brands") { ?>
                    <div id="brands" class="tabcontent">
                        <h3>Brands</h3>
                        <p>
                            <div class="bootstrap-iso">
                                <?php 
								$arrBrands = array();
								$request = new LazopRequest('/brands/get','GET');
								$request->addApiParam('offset',0);
								$request->addApiParam('limit',1000);
								$arrResults = $c->execute($request);
								$arrResults = json_decode($arrResults, true); 
								$arrBrands = (isset($arrResults["data"])?$arrResults["data"]:array());
                                ?>
                                <select id="brand" name="brand" placeholder="Brand" onChange="javascript:changeBrand(this.value);" >
                                    <option value="">Select Brand</option>
                                    <option value="No Brand">No Brand</option>
                                    <?php if(isset($arrBrands) && is_array($arrBrands) && count($arrBrands)>0) { ?>
                                        <?php foreach($arrBrands as $keyBrand => $valueBrand) { ?>
                                            <option value="<?php echo $valueBrand["name"]; //$valueBrand["brand_id"]; ?>"><?php echo $valueBrand["name"]; ?></option>
                                        <?php } ?>
                                    <?php } ?>
                                </select>
                            </div>
                        </p>
                    </div>
                <?php } ?>
                
                
                <?php if($strTabType=="prodlist") { ?>
                    <div id="prodlist" class="tabcontent">
                        <h3>Product Listing</h3>
                        <p>
                            <?php 
                                $arrBrands = array();
								$request = new LazopRequest('/products/get','GET');
								/*$request->addApiParam('filter','live');
								$request->addApiParam('update_before','2018-01-01T00:00:00+0800');
								$request->addApiParam('search','product_name');
								$request->addApiParam('create_before','2018-01-01T00:00:00+0800');
								$request->addApiParam('offset','0');
								$request->addApiParam('create_after','2010-01-01T00:00:00+0800');
								$request->addApiParam('update_after','2010-01-01T00:00:00+0800');
								$request->addApiParam('limit','10');
								$request->addApiParam('options','1');
								$request->addApiParam('sku_seller_list',' [\"39817:01:01\", \"Samsung Note FE Black\"]');*/
								$arrResults = $c->execute($request, $accessToken);
								$arrResults = json_decode($arrResults, true); 
								echo "<pre>";print_r($arrResults);echo "</pre>";//exit;
                            ?>
                        </p>
                    </div>
                <?php } ?>
                
                <?php if($strTabType=="addprod") { ?>
                    <div id="addprod" class="tabcontent">
                        <h3>Add A Product</h3>
                        <p>
                            <?php 
                                if(isset($_SESSION["category_id"]) && $_SESSION["category_id"]!="") {
                                    // Add Item
									$strXML = '<?xml version="1.0" encoding="UTF-8" ?>
									<Request>
										<Product>
											<PrimaryCategory>'.$_SESSION["category_id"].'</PrimaryCategory>
											<SPUId></SPUId>
											<AssociatedSku></AssociatedSku>
											<Attributes>
												<name>Sync Product, Don\'t Buy</name>
												<short_description>Sync Product, Don\'t Buy</short_description>
												<brand>'.(isset($_SESSION["brand"])&&$_SESSION["brand"]!=""?$_SESSION["brand"]:"No Brand").'</brand>
												<model>theModel</model>
											</Attributes>
											<Skus>
												<Sku>
													<SellerSku>api-create-test-x1</SellerSku>
													<color_family>Green</color_family>
													<size>40</size>
													<quantity>1</quantity>
													<price>1.50</price>
													<package_weight>0.50</package_weight>
													<package_length>10</package_length>
													<package_height>20</package_height>
													<package_width>50</package_width>
													<package_content>As described as Description</package_content>
													<tax_class>default</tax_class>
												</Sku>
											</Skus>
										</Product>
									</Request>';
									$request = new LazopRequest('/product/create');
									$request->addApiParam('payload', $strXML);
									$arrResults = $c->execute($request, $accessToken);
									$arrResults = json_decode($arrResults, true);
									//echo "<pre>";print_r($arrResults);echo "</pre>";exit;
									
									$sync_error = "";
									$sync_msg = "";
									$lazada_sync = 0;
									if(isset($arrResults["code"])) {
										if($arrResults["code"]=="0") {
											echo "<pre>";print_r($arrResults);echo "</pre>";//exit;
											$sync_msg = "Product successfully synced.";
											if(!isset($_SESSION["skus"])) {
												$_SESSION["skus"] = array();	
											}
											$_SESSION["skus"][] = (isset($arrResults["data"]["sku_list"][0]["seller_sku"])?$arrResults["data"]["sku_list"][0]["seller_sku"]:"");
											// Images will be migrated to lazada site before set to the product. - Start
											$strImages = "<Request><Images><Url>http://limcorp.net/images/shop_open-512.png</Url></Images></Request>";
											//echo "<pre>";print_r($strImages);echo "</pre>";exit;
											$request = new LazopRequest('/images/migrate');
											$request->addApiParam('payload', $strImages);
											$arrResults = $c->execute($request, $accessToken);
											$arrResults = json_decode($arrResults, true);
											//echo "<pre>";print_r($arrResults);echo "</pre>";
											$intBatchID = "";
											if(isset($arrResults["batch_id"]) && $arrResults["batch_id"]!="") {
												$intBatchID = $arrResults["batch_id"];
											}
											if($intBatchID!="") {
												sleep(3);
												$request = new LazopRequest('/image/response/get','GET');
												$request->addApiParam('batch_id', $intBatchID);
												$arrResults = $c->execute($request, $accessToken);
												$arrResults = json_decode($arrResults, true);
												//echo "<pre>".$intBatchID;print_r($arrResults);echo "</pre>";
												if(isset($arrResults["code"]) && $arrResults["code"]=="0" && isset($arrResults["data"]["images"]) && is_array($arrResults["data"]["images"]) && count($arrResults["data"]["images"])>0) {
													if(isset($arrResults["data"]["errors"]) && is_array($arrResults["data"]["errors"]) && count($arrResults["data"]["errors"])>0) {
														$sync_msg .= "; But ".count($arrResults["data"]["errors"])." photo".(count($arrResults["data"]["errors"])>1?"s":"")." failed to upload (Image min height [330], min width[330])";
													}
													$strImages = "
													<Request>
														<Product>
															<Skus>
																<Sku>
																	<SellerSku>api-create-test-x1</SellerSku>
																	<Images>";
																		foreach($arrResults["data"]["images"] as $keyImage => $valueImage) {
																			$strImages .= "<Image>".$valueImage["url"]."</Image>";
																		}
													$strImages .= "</Images>
																</Sku>
															</Skus>
														</Product>
													</Request>";
													$request = new LazopRequest('/images/set');
													$request->addApiParam('payload', $strImages);
													$arrResults = $c->execute($request, $accessToken);
													$arrResults = json_decode($arrResults, true);
													//echo "<pre>".$intBatchID;print_r($arrResults);echo "</pre>";
												} else if(isset($arrResults["code"]) && $arrResults["code"]!="0") {
													$sync_msg .= "; But all photo(s) failed to upload".(isset($arrResults["message"])?(" (".$arrResults["message"].")"):"")."";
												}
											}
											// Images will be migrated to lazada site before set to the product. - End
											echo $sync_msg."<br />";
										} else {
											echo "Error: ".$arrResults["code"]."<br />";
											echo $arrResults["message"].(isset($arrResults["detail"][0]["message"])?(" (".$arrResults["detail"][0]["message"].")"):"");
										}
									} else {
										echo "Failed to sync. please try again!";
									}
								} else {
									echo "<pre>";print_r("Category ID is compulsory!");echo "</pre>";//exit;
								}
                            ?>
                        </p>
                    </div>
                <?php } ?>
                
                <?php if($strTabType=="proddetail") { ?>
                    <div id="proddetail" class="tabcontent">
                        <h3>A Product Details</h3>
                        <p>
                            <?php 
                                if(isset($_SESSION["skus"]) && count($_SESSION["skus"])>0) {
                                    foreach($_SESSION["skus"] as $keyData => $valueData) {
                                        $request = new LazopRequest('/products/get','GET');
										/*$request->addApiParam('filter','live');
										$request->addApiParam('update_before','2018-01-01T00:00:00+0800');
										$request->addApiParam('search','product_name');
										$request->addApiParam('create_before','2018-01-01T00:00:00+0800');
										$request->addApiParam('offset','0');
										$request->addApiParam('create_after','2010-01-01T00:00:00+0800');
										$request->addApiParam('update_after','2010-01-01T00:00:00+0800');
										$request->addApiParam('limit','10');
										$request->addApiParam('options','1');*/
										$request->addApiParam('sku_seller_list','["'.$valueData.'"]');
										$arrResults = $c->execute($request, $accessToken);
										$arrResults = json_decode($arrResults, true); 
										echo "<pre>";print_r($arrResults);echo "</pre>";//exit;
                                        break;
                                    }
                                } else {
                                    echo "<pre>";print_r("Seller SKU(s) is compulsory!");echo "</pre>";//exit;
                                }
                            ?>
                        </p>
                    </div>
                <?php } ?>
                
                <?php if($strTabType=="delprods") { ?>
                    <div id="delprods" class="tabcontent">
                        <h3>Delete Product(s)</h3>
                        <p>
                            <?php 
                                if(isset($_SESSION["skus"]) && count($_SESSION["skus"])>0) {
                                    foreach($_SESSION["skus"] as $keyData => $valueData) {
                                        $request = new LazopRequest('/product/remove');
										$request->addApiParam('seller_sku_list','["'.$valueData.'"]');
										$arrResults = $c->execute($request, $accessToken);
										$arrResults = json_decode($arrResults, true); 
										echo "<pre>";print_r($arrResults);echo "</pre>";//exit;
                                    }
                                    unset($_SESSION["skus"]);
                                } else {
                                    echo "<pre>";print_r("Seller SKU(s) is compulsory!");echo "</pre>";//exit;
                                }
                            ?>
                        </p>
                    </div>
                <?php } ?>
                
                <?php if($strTabType=="orders") { ?>
                    <div id="orders" class="tabcontent">
                        <h3>Orders</h3>
                        <p>
                            <div class="bootstrap-iso">
                                <?php 
								$request = new LazopRequest('/orders/get','GET');
								$request->addApiParam('created_after','2020-01-01T00:00:00+0800');
								$arrResults = $c->execute($request, $accessToken);
								$arrayOrdersData = json_decode($arrResults, true);
								echo "<pre>ALL ORDER:";print_r($arrayOrdersData);echo "</pre>";//exit;
                            	?>
                            </div>
                        </p>
                    </div>
                <?php } ?>
            <?php } ?>
            
		<?php 
		} else {
			unset($_SESSION["category_id"]);
			unset($_SESSION["brand"]);
			unset($_SESSION["skus"]);
			unset($_SESSION["lazada_access_token"]);
		} ?>
        
        <br /><br />
        <div>
            <table style="position:relative;border:1px groove black;width:100%;">
                <tr>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td style="width:70%;"><h3>References</h3></td>
                </tr>
                <tr>
                    <td align="right">API Documentations</td>
                    <td>:</td>
                    <td><a href="https://open.lazada.com/doc/api.htm#/api?cid=5&path=/product/create" target="_blank">https://open.lazada.com/doc/api.htm#/api?cid=5&path=/product/create</a></td>
                </tr>
                <tr>
                    <td align="right">Link to Synced Product</td>
                    <td>:</td>
                    <td>https://www.lazada.com.my/products/<em>UNIQUE_ID</em>.html</td>
                </tr>
            </table>
        </div>
        
		<script type="text/javascript">
            <?php if($strTabType=="" || $strTabType=="category") { ?>
                openCity('category')
            <?php } else if($strTabType=="brands") { ?>
                openCity('brands')
            <?php } else if($strTabType=="prodlist") { ?>
                openCity('prodlist')
            <?php } else if($strTabType=="addprod") { ?>
                openCity('addprod')
            <?php } else if($strTabType=="proddetail") { ?>
                openCity('proddetail')
            <?php } else if($strTabType=="delprods") { ?>
                openCity('delprods')
            <?php } else if($strTabType=="orders") { ?>
                openCity('orders')
            <?php } ?>
        </script>
        
    </div>
<br /><br /><br /><br /><br /><br /><br /><br /><br /><br /><br />
</body>
</html>