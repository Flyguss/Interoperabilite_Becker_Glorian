<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
      xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

  <xsl:output method="html" indent="yes"/>

  <!-- Racine -->
<xsl:template match="/previsions">
  <div class="resume-meteo">
    <h2>Resume meteo de la journee</h2>

    <!-- Date extraite de la première échéance -->
    <p><strong>Date :</strong> 
      <xsl:value-of select="echeance[1]/@timestamp"/>
    </p>

    <xsl:apply-templates select="echeance[@hour='6']">
      <xsl:with-param name="moment" select="'Matin'"/>
    </xsl:apply-templates>

    <xsl:apply-templates select="echeance[@hour='12']">
      <xsl:with-param name="moment" select="'Midi'"/>
    </xsl:apply-templates>

    <xsl:apply-templates select="echeance[@hour='18']">
      <xsl:with-param name="moment" select="'Soir'"/>
    </xsl:apply-templates>

  </div>
</xsl:template>

  <!-- Interprétation qualitative -->
  <xsl:template match="echeance">
    <xsl:param name="moment"/>

    <div class="moment">
      <h3><xsl:value-of select="$moment"/></h3>
      <p>
        <!-- Froid ? -->
        <xsl:variable name="temp" select="temperature/level[1]/@val"/>
        <xsl:if test="$temp &lt; 5">Froid<br/></xsl:if>

        <!-- Pluie ? -->
        <xsl:variable name="pluie" select="number(pluie)"/>
        <xsl:if test="$pluie &gt; 0">Pluie<br/></xsl:if>

        <!-- Neige ? -->
        <xsl:variable name="neige" select="number(risque_neige)"/>
        <xsl:if test="$neige &gt; 0">Risque de neige<br/></xsl:if>

        <!-- Vent ? -->
        <xsl:variable name="rafales" select="vent_rafales/level[1]/@val"/>
        <xsl:if test="$rafales &gt; 40">Vent fort<br/></xsl:if>

        <!-- Si rien de spécial -->
        <xsl:if test="not(($temp &lt; 5) or ($pluie &gt; 0) or ($neige &gt; 0) or ($rafales &gt; 40))">
          Temps calme
        </xsl:if>
      </p>
    </div>
  </xsl:template>

</xsl:stylesheet>
