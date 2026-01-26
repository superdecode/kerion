import pandas as pd
import numpy as np
from difflib import SequenceMatcher
from fuzzywuzzy import fuzz
from fuzzywuzzy import process
import warnings
warnings.filterwarnings('ignore')

# ============================================================================
# 1. CARGAR DATOS
# ============================================================================

def cargar_datos():
    """Carga los archivos de datos necesarios"""
    # Reemplaza 'archivo.csv' con tus archivos reales
    inventario = pd.read_csv('inventario.csv')
    stock = pd.read_csv('stock.csv')
    ordenes_trabajo = pd.read_csv('ordenes_trabajo.csv')
    
    # Mostrar estructura
    print("📊 ESTRUCTURA DE DATOS")
    print(f"Inventario: {inventario.shape}")
    print(f"Stock: {stock.shape}")
    print(f"Órdenes de Trabajo: {ordenes_trabajo.shape}\n")
    
    return inventario, stock, ordenes_trabajo

# ============================================================================
# 2. IDENTIFICAR DUPLICADOS EN INVENTARIO
# ============================================================================

def identificar_duplicados(df, columnas_key):
    """
    Identifica duplicados exactos y parciales en el inventario
    
    Parámetros:
    - df: DataFrame del inventario
    - columnas_key: lista de columnas para verificar duplicados
    """
    print("🔍 PASO 1: IDENTIFICAR DUPLICADOS")
    print("-" * 60)
    
    # Duplicados exactos
    duplicados_exactos = df[df.duplicated(subset=columnas_key, keep=False)]
    print(f"Duplicados exactos encontrados: {len(duplicados_exactos)}")
    
    if len(duplicados_exactos) > 0:
        print("\nDetalle de duplicados:")
        print(duplicados_exactos[columnas_key].sort_values(columnas_key[0]))
    
    # Limpiar duplicados (mantener primer registro)
    df_limpio = df.drop_duplicates(subset=columnas_key, keep='first')
    print(f"\nRegistros eliminados: {len(df) - len(df_limpio)}")
    print(f"Inventario limpio: {len(df_limpio)} registros\n")
    
    return df_limpio, duplicados_exactos

# ============================================================================
# 3. CRUCE EXACTO CON STOCK
# ============================================================================

def cruzar_con_stock(inventario, stock, codigo_inv, codigo_stock):
    """
    Realiza un cruce directo entre inventario y stock
    
    Parámetros:
    - inventario: DataFrame del inventario
    - stock: DataFrame del stock disponible
    - codigo_inv: nombre de columna de código en inventario
    - codigo_stock: nombre de columna de código en stock
    """
    print("✅ PASO 2: CRUCE EXACTO CON STOCK")
    print("-" * 60)
    
    # Cruce con merge
    cruce = inventario.merge(
        stock[[codigo_stock, 'cantidad']],
        left_on=codigo_inv,
        right_on=codigo_stock,
        how='left',
        indicator=True
    )
    
    # Separar coincidencias y no coincidencias
    en_stock = cruce[cruce['_merge'] == 'both'].copy()
    sin_stock = cruce[cruce['_merge'] == 'left_only'].copy()
    
    print(f"Artículos EN STOCK: {len(en_stock)}")
    print(f"Artículos SIN STOCK (códigos no coinciden): {len(sin_stock)}")
    print(f"\nEjemplos sin stock:")
    print(sin_stock[[codigo_inv, 'descripcion']].head(10) if 'descripcion' in sin_stock.columns else sin_stock[[codigo_inv]].head(10))
    print()
    
    return cruce, en_stock, sin_stock

# ============================================================================
# 4. BÚSQUEDA FLEXIBLE CON FUZZY MATCHING
# ============================================================================

def busqueda_flexible(sin_stock, stock, codigo_inv, codigo_stock, 
                      columna_desc_inv='descripcion', columna_desc_stock='descripcion',
                      umbral=80):
    """
    Busca coincidencias parciales en códigos y descripciones usando fuzzy matching
    
    Parámetros:
    - sin_stock: items sin coincidencia exacta
    - stock: DataFrame del stock
    - umbral: score mínimo de similitud (0-100)
    """
    print("🔎 PASO 3: BÚSQUEDA FLEXIBLE (FUZZY MATCHING)")
    print("-" * 60)
    
    coincidencias_fuzzy = []
    
    for idx, row_inv in sin_stock.iterrows():
        codigo = row_inv[codigo_inv]
        desc = str(row_inv[columna_desc_inv]) if columna_desc_inv in row_inv else ""
        
        # Buscar por código con fuzzy matching
        matches_codigo = process.extract(
            codigo,
            stock[codigo_stock].astype(str),
            scorer=fuzz.token_sort_ratio,
            limit=3
        )
        
        # Buscar por descripción si existe
        matches_desc = []
        if desc and columna_desc_stock in stock.columns:
            matches_desc = process.extract(
                desc,
                stock[columna_desc_stock].astype(str),
                scorer=fuzz.token_set_ratio,
                limit=2
            )
        
        # Tomar el mejor match
        mejor_match = None
        mejor_score = 0
        origen = ""
        
        for match_text, score in matches_codigo:
            if score > mejor_score:
                mejor_score = score
                mejor_match = match_text
                origen = "Código"
        
        for match_text, score in matches_desc:
            if score > mejor_score:
                mejor_score = score
                mejor_match = match_text
                origen = "Descripción"
        
        # Si cumple umbral, registrar
        if mejor_match and mejor_score >= umbral:
            stock_row = stock[stock[codigo_stock].astype(str) == mejor_match].iloc[0]
            coincidencias_fuzzy.append({
                'cod_inventario': codigo,
                'desc_inventario': desc,
                'cod_stock_encontrado': mejor_match,
                'desc_stock': stock_row[columna_desc_stock] if columna_desc_stock in stock.columns else "",
                'score': mejor_score,
                'cantidad_stock': stock_row['cantidad'] if 'cantidad' in stock.columns else None,
                'origen_match': origen
            })
    
    resultados_fuzzy = pd.DataFrame(coincidencias_fuzzy)
    print(f"Coincidencias encontradas por similitud: {len(resultados_fuzzy)}")
    
    if len(resultados_fuzzy) > 0:
        print("\nMejores coincidencias (primeras 10):")
        print(resultados_fuzzy[['cod_inventario', 'cod_stock_encontrado', 'score', 'origen_match']].head(10).to_string())
    
    print()
    return resultados_fuzzy

# ============================================================================
# 5. CRUZAR CON ÓRDENES DE TRABAJO (MAPEO DE CÓDIGOS)
# ============================================================================

def cruzar_con_ordenes_trabajo(sin_stock, ordenes_trabajo, 
                               codigo_inv='codigo_viejo', codigo_nuevo='codigo_nuevo'):
    """
    Identifica cambios de códigos registrados en órdenes de trabajo
    
    Parámetros:
    - sin_stock: items sin coincidencia
    - ordenes_trabajo: histórico de cambios de códigos
    - codigo_inv: nombre de columna para código viejo
    - codigo_nuevo: nombre de columna para código nuevo
    """
    print("📋 PASO 4: CRUZAR CON ÓRDENES DE TRABAJO")
    print("-" * 60)
    
    # Crear diccionario de mapeo de códigos antiguos a nuevos
    if codigo_inv in ordenes_trabajo.columns and codigo_nuevo in ordenes_trabajo.columns:
        mapeo_codigos = dict(zip(
            ordenes_trabajo[codigo_inv].astype(str),
            ordenes_trabajo[codigo_nuevo].astype(str)
        ))
        
        # Buscar códigos antiguos que hayan sido reemplazados
        sin_stock['codigo_nuevo_mapeado'] = sin_stock['codigo'].apply(
            lambda x: mapeo_codigos.get(str(x), None)
        )
        
        encontrados_ordenes = sin_stock[sin_stock['codigo_nuevo_mapeado'].notna()].copy()
        print(f"Códigos encontrados en órdenes de trabajo: {len(encontrados_ordenes)}")
        
        if len(encontrados_ordenes) > 0:
            print("\nEjemplos de códigos mapeados:")
            print(encontrados_ordenes[['codigo', 'codigo_nuevo_mapeado']].head(10))
        
        print()
        return sin_stock, encontrados_ordenes
    else:
        print("⚠️ Columnas de órdenes de trabajo no encontradas\n")
        return sin_stock, pd.DataFrame()

# ============================================================================
# 6. GENERAR REPORTES FINALES
# ============================================================================

def generar_reportes(cruce, en_stock, sin_stock, coincidencias_fuzzy, 
                     encontrados_ordenes, archivo_salida='reporte_inventario.xlsx'):
    """
    Genera reportes en Excel con los resultados del análisis
    """
    print("📄 PASO 5: GENERAR REPORTES")
    print("-" * 60)
    
    with pd.ExcelWriter(archivo_salida, engine='openpyxl') as writer:
        # Hoja 1: Resumen
        resumen = pd.DataFrame({
            'Métrica': [
                'Total inventario',
                'En stock (cruce exacto)',
                'Sin stock (directo)',
                'Coincidencias fuzzy',
                'Encontrados en órdenes trabajo',
                'Sin ubicación definitiva'
            ],
            'Cantidad': [
                len(cruce),
                len(en_stock),
                len(sin_stock),
                len(coincidencias_fuzzy),
                len(encontrados_ordenes),
                len(sin_stock) - len(coincidencias_fuzzy) - len(encontrados_ordenes)
            ]
        })
        resumen.to_excel(writer, sheet_name='RESUMEN', index=False)
        
        # Hoja 2: En stock
        en_stock.to_excel(writer, sheet_name='En Stock', index=False)
        
        # Hoja 3: Coincidencias fuzzy
        if len(coincidencias_fuzzy) > 0:
            coincidencias_fuzzy.to_excel(writer, sheet_name='Fuzzy Matches', index=False)
        
        # Hoja 4: Mapeado desde órdenes
        if len(encontrados_ordenes) > 0:
            encontrados_ordenes.to_excel(writer, sheet_name='Mapeado Órdenes', index=False)
        
        # Hoja 5: Sin resolver
        sin_resolver = sin_stock[~sin_stock.index.isin(coincidencias_fuzzy.index) & 
                                 ~sin_stock.index.isin(encontrados_ordenes.index)]
        if len(sin_resolver) > 0:
            sin_resolver.to_excel(writer, sheet_name='Sin Resolver', index=False)
    
    print(f"✅ Reporte guardado en: {archivo_salida}\n")

# ============================================================================
# 7. EJECUTAR ANÁLISIS COMPLETO
# ============================================================================

def ejecutar_analisis_completo():
    """Ejecuta todo el proceso de análisis"""
    
    print("\n" + "="*60)
    print("ANÁLISIS COMPLETO DE INVENTARIO")
    print("="*60 + "\n")
    
    # Paso 1: Cargar datos
    inventario, stock, ordenes_trabajo = cargar_datos()
    
    # Paso 2: Limpiar duplicados
    # IMPORTANTE: Ajusta 'codigo' según el nombre real de tu columna
    inventario_limpio, duplicados = identificar_duplicados(
        inventario, 
        columnas_key=['codigo']  # Cambia según tus columnas
    )
    
    # Paso 3: Cruce exacto con stock
    # IMPORTANTE: Ajusta los nombres de columnas según tus datos
    cruce, en_stock, sin_stock = cruzar_con_stock(
        inventario_limpio,
        stock,
        codigo_inv='codigo',
        codigo_stock='codigo_stock'
    )
    
    # Paso 4: Búsqueda flexible
    coincidencias_fuzzy = busqueda_flexible(
        sin_stock,
        stock,
        codigo_inv='codigo',
        codigo_stock='codigo_stock',
        columna_desc_inv='descripcion',
        columna_desc_stock='descripcion_stock',
        umbral=80  # Ajusta según necesites (mayor = más estricto)
    )
    
    # Paso 5: Cruzar con órdenes de trabajo
    sin_stock_actualizado, encontrados_ordenes = cruzar_con_ordenes_trabajo(
        sin_stock,
        ordenes_trabajo,
        codigo_inv='codigo_viejo',
        codigo_nuevo='codigo_nuevo'
    )
    
    # Paso 6: Generar reportes
    generar_reportes(
        cruce, en_stock, sin_stock, 
        coincidencias_fuzzy, encontrados_ordenes,
        archivo_salida='reporte_inventario_completo.xlsx'
    )
    
    print("="*60)
    print("✨ ANÁLISIS FINALIZADO")
    print("="*60 + "\n")

# ============================================================================
# EJECUTAR
# ============================================================================

if __name__ == "__main__":
    # Instala estas librerías primero:
    # pip install pandas numpy fuzzywuzzy python-Levenshtein openpyxl
    
    ejecutar_analisis_completo()